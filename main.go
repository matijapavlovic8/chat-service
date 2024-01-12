package main

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
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

	// Run the server
	err := router.Run(":5000")
	if err != nil {
		return
	}
}

func handleLongPoll(c *gin.Context) {
	clientId := c.GetHeader("Client-Id")
	var recipient string
	for _, cli := range clientCache {
		if cli != clientId {
			recipient = cli
		}
	}

	timeout := time.After(30 * time.Second)
	for {
		cacheMutex.Lock()
		message, found := messageCache[recipient]
		cacheMutex.Unlock()

		if found {
			c.JSON(http.StatusOK, message)
			delete(messageCache, clientId)
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
