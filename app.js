document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('message-input');
    const methodPicker = document.getElementById('method-picker');
    const sendButton = document.getElementById('send-button');
    const chatOutput = document.getElementById('chat-output');

    let clientId = sessionStorage.getItem('clientId');
    if (!clientId) {
        clientId = prompt('Please enter your username:');
        sessionStorage.setItem('clientId', clientId);
    }

    sendButton.addEventListener('click', () => {
        const message = messageInput.value;
        if (message.trim() !== '') {
            sendMessage(message, clientId);
            messageInput.value = '';
        }
    });


    methodPicker.addEventListener('change', () => {
        const selectedMethod = methodPicker.value;
        if (selectedMethod === 'websocket') {
            connectWebSocket();
            stopPolling(clientId)
        } else if (selectedMethod === 'polling') {
            initPolling(clientId, false);
        } else if (selectedMethod === 'longpolling') {
            initPolling(clientId, true);
        } else if (selectedMethod === 'disconnected') {
            disconnectWebSocket()
            stopPolling(clientId)
        }
    });

});

let pollingIntervals = {};

function initPolling(clientId, useLongPoll) {
    if (!pollingIntervals[clientId]) {
        pollingIntervals[clientId] = setInterval(() => {
            pollForMessage(clientId, useLongPoll);
        }, 2000); // Poll every 2 seconds (adjust as needed)
    }
}

function stopPolling(clientId) {
    if (pollingIntervals[clientId]) {
        clearInterval(pollingIntervals[clientId]);
        delete pollingIntervals[clientId];
    }
}


function sendMessage(message, clientId) {
    const xhr = new XMLHttpRequest();
    const url = 'http://localhost:5000/message';

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Client-Id', clientId);

    xhr.onload = function () {
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            console.log(data);
        } else {
            console.error('Request failed. Status: ' + xhr.status);
        }
    };

    xhr.onerror = function () {
        console.error('Network error occurred');
    };

    const body = JSON.stringify({ "message": message });
    xhr.send(body);
}

function pollForMessage(clientId, useLongPoll) {
    const xhr = new XMLHttpRequest();
    const url = useLongPoll ? 'http://localhost:5000/long_poll_message' : 'http://localhost:5000/poll_message';

    xhr.open('GET', url, true);
    xhr.setRequestHeader('Client-Id', clientId);

    xhr.onload = function () {
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            if (data) {
                displayMessage(data['message'], data['client_id']);
                console.log(data);
            }
        } else if (xhr.status === 204) {
            // No content
        } else {
            console.error('Failed to poll for messages. Status: ' + xhr.status);
        }
    };

    xhr.onerror = function () {
        console.error('Network error occurred');
    };

    xhr.send();
}


function disconnectWebSocket(socket) {
    if (socket) {
        socket.close();
    }
}

function displayMessage(message, clientId) {
    const chatOutput = document.getElementById('chat-output');
    const messageElement = document.createElement('div');
    messageElement.textContent = `${clientId}: ${message}`;
    chatOutput.appendChild(messageElement);
}

function connectWebSocket() {
    let socket = new WebSocket('ws://localhost:5000'); // Assuming your server is running on localhost:3000

    socket.addEventListener('open', (event) => {
        console.log('WebSocket connection opened:', event);
    });

    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        displayMessage(message);
    });

    socket.addEventListener('close', (event) => {
        console.log('WebSocket connection closed:', event);
    });
}
