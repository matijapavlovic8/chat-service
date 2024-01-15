package main

import (
	"fmt"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"net/http"
	"sync"
	"time"
)

type Message struct {
	Text     string `json:"message"`
	ClientId string `json:"client_id"`
}

var messageCache = make(map[string]Message)
var clientCache []string
var cacheMutex sync.Mutex
var connectionCache = make(map[string]*websocket.Conn)
var connMutex sync.Mutex
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func main() {
	router := gin.Default()

	config := cors.DefaultConfig()
	config.AllowOrigins = []string{"*"}
	config.AllowMethods = []string{"POST", "OPTIONS"}
	config.AllowHeaders = append(config.AllowHeaders, "Client-Id")
	router.Use(cors.New(config))

	// API endpoint for receiving messages
	router.POST("/message", handleMessage)
	router.GET("/poll_message", handlePoll)
	router.GET("/long_poll_message", handleLongPoll)
	router.GET("/ws", handleWebSocket)
	router.OPTIONS("/ws", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	// Run the server
	err := router.Run(":5000")
	if err != nil {
		return
	}
}

func handleWebSocket(c *gin.Context) {
	// Upgrade the HTTP connection to a WebSocket connection
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upgrade connection to WebSocket"})
		return
	}

	clientId := c.Query("client_id")
	fmt.Printf("Client %s connected\n", clientId)

	connMutex.Lock()
	connectionCache[clientId] = conn
	connMutex.Unlock()

	// Use WaitGroup to wait for the Goroutine to complete
	var wg sync.WaitGroup
	wg.Add(1)

	// Start a Goroutine to handle the WebSocket connection
	go func() {
		defer func() {
			// Close the WebSocket connection when the Goroutine exits
			connMutex.Lock()
			delete(connectionCache, clientId)
			connMutex.Unlock()
			conn.Close()
			fmt.Printf("Client %s disconnected\n", clientId)

			// Signal that the Goroutine has completed
			wg.Done()
		}()

		// Periodically check for messages for the connected client
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				var senderId string
				for _, cli := range clientCache {
					if cli != clientId {
						senderId = cli
					}
				}
				cacheMutex.Lock()
				message, found := messageCache[senderId]
				cacheMutex.Unlock()
				if found {
					fmt.Printf("Sending message to client %s: %s\n", clientId, message)

					// Send the message to the client
					connMutex.Lock()
					if err := connectionCache[clientId].WriteJSON(message); err != nil {
						fmt.Println("Error sending message:", err)
					}
					connMutex.Unlock()

					cacheMutex.Lock()
					delete(messageCache, senderId)
					cacheMutex.Unlock()
				}
			}
		}
	}()

	// Wait for the Goroutine to complete before returning from the function
	wg.Wait()
}

func handleLongPoll(c *gin.Context) {
	clientId := c.GetHeader("Client-Id")
	var senderId string
	for _, cli := range clientCache {
		if cli != clientId {
			senderId = cli
		}
	}

	timeout := time.After(10 * time.Second)
	for {
		cacheMutex.Lock()
		message, found := messageCache[senderId]
		cacheMutex.Unlock()

		if found {
			c.JSON(http.StatusOK, message)
			delete(messageCache, senderId)
			return
		}

		select {
		case <-time.After(1 * time.Second): // Poll every second
			// Continue polling
		case <-timeout:
			// Timeout occurred, respond with no content
			c.JSON(http.StatusNoContent, nil)
			return
		}
	}
}

func handlePoll(c *gin.Context) {
	clientId := c.GetHeader("Client-Id")
	var senderId string
	for _, msg := range messageCache {
		if msg.ClientId != clientId {
			c.JSON(http.StatusOK, msg)
			senderId = msg.ClientId
		}
	}
	delete(messageCache, senderId)

	c.JSON(http.StatusNoContent, nil)
}

func handleMessage(c *gin.Context) {
	var message Message

	if err := c.BindJSON(&message); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	clientId := c.GetHeader("Client-Id")
	message.ClientId = clientId
	if !cacheContainsClient(clientId) && len(clientCache) < 2 {
		clientCache = append(clientCache, clientId)
	}

	messageCache[clientId] = message

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

func cacheContainsClient(clientId string) bool {
	for _, cli := range clientCache {
		if cli == clientId {
			return true
		}
	}
	return false
}
