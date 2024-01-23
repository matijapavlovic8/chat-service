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
            stopPolling(clientId)
            longPollingActive[clientId] = false
            connectWebSocket(clientId);
        } else if (selectedMethod === 'polling') {
            disconnectWebSocket(clientId)
            longPollingActive[clientId] = false
            stopPolling(clientId)
            initPolling(clientId);
        } else if (selectedMethod === 'longpolling') {
            disconnectWebSocket(clientId)
            stopPolling(clientId)
            longPollingActive[clientId] = true
            longPollForMessage(clientId);
        } else if (selectedMethod === 'disconnected') {
            disconnectWebSocket(clientId)
            longPollingActive[clientId] = false
            stopPolling(clientId)
        }
    });

});

let pollingIntervals = {};
let sockets = {}
let longPollingActive = {}

function initPolling(clientId) {
    if (!pollingIntervals[clientId]) {
        pollingIntervals[clientId] = setInterval(() => {
            pollForMessage(clientId);
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

function pollForMessage(clientId) {
    const xhr = new XMLHttpRequest();
    const url = 'http://localhost:5000/poll-message';

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

        } else {
            console.error('Failed to poll for messages. Status: ' + xhr.status);
        }
    };

    xhr.onerror = function () {
        console.error('Network error occurred');
    };

    xhr.send();
}

function longPollForMessage(clientId) {
    const xhr = new XMLHttpRequest();
    const url = 'http://localhost:5000/long-poll-message';
    longPollingActive[clientId] = true

    xhr.open('GET', url, true);
    xhr.setRequestHeader('Client-Id', clientId);

    xhr.onload = function () {
        if (!longPollingActive[clientId]) {

        } else if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            if (data) {
                displayMessage(data['message'], data['client_id']);
                console.log(data);
                longPollForMessage(clientId)
            }
        } else if (xhr.status === 204) {
            longPollForMessage(clientId)
        } else {
            console.error('Failed to poll for messages. Status: ' + xhr.status);
        }
    };

    xhr.onerror = function () {
        console.error('Network error occurred');
    };

    xhr.send();
}

function disconnectWebSocket(clientId) {
    let socket = sockets[clientId];
    if (socket) {
        socket.onclose = null; // Remove any existing onclose handler
        socket.close();
    }
}

function displayMessage(message, clientId) {
    const chatOutput = document.getElementById('chat-output');
    const messageElement = document.createElement('div');
    messageElement.textContent = `${clientId}: ${message}`;
    chatOutput.innerHTML = ''
    chatOutput.appendChild(messageElement);
}

function connectWebSocket(clientId) {
    let socket = new WebSocket(`ws://localhost:5000/ws?client_id=${clientId}`);
    sockets[clientId] = socket
    sockets[clientId].addEventListener('open', (event) => {
        console.log('WebSocket connection opened for client: ', clientId, event);
    });

    sockets[clientId].addEventListener('message', (event) => {
        let data = JSON.parse(event.data)
        console.log(data)
        displayMessage(data['message'], data['client_id'])
    })

    socket.addEventListener('close', (event) => {
        console.log('WebSocket connection closed:', event);
    });
}
