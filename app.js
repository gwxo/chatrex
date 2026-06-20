const CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const BASE_URL = "https://chatrex.pages.dev/";

const state = {
    pc: null,
    dataChannel: null,
    isHost: false,
    username: 'User_' + Math.floor(Math.random() * 1000)
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Check for Google Lens / URL data
    const urlParams = new URLSearchParams(window.location.search);
    const remoteData = urlParams.get('data');
    
    if (remoteData) {
        startGuest(remoteData);
    }

    document.getElementById('btn-create-room').onclick = startHost;
    document.getElementById('btn-join-room').onclick = () => startGuest();
    document.getElementById('btn-send').onclick = sendMessage;
    document.getElementById('msg-input').onkeydown = (e) => e.key === 'Enter' && sendMessage();
});

// --- WebRTC Logic ---

async function createPeerConnection() {
    state.pc = new RTCPeerConnection(CONFIG);

    state.pc.onicecandidate = (e) => {
        if (!e.candidate) {
            const sdp = btoa(JSON.stringify(state.pc.localDescription));
            if (state.isHost) {
                const fullUrl = `${BASE_URL}?data=${sdp}`;
                generateQR('qrcode-container', fullUrl);
                document.getElementById('manual-code-host').value = sdp;
            } else {
                generateQR('qrcode-answer-container', sdp);
                document.getElementById('manual-code-guest').value = sdp;
            }
        }
    };

    state.pc.ondatachannel = (e) => setupDataChannel(e.channel);
}

function setupDataChannel(channel) {
    state.dataChannel = channel;
    state.dataChannel.onopen = () => {
        showScreen('chat');
        if (window.history.pushState) {
            window.history.pushState({}, null, BASE_URL); // Clean URL
        }
    };
    state.dataChannel.onmessage = (e) => appendMessage(JSON.parse(e.data), 'received');
}

// --- Host Flow ---
async function startHost() {
    state.isHost = true;
    showScreen('connection-screen');
    document.getElementById('step-1-offer').classList.remove('hidden');
    
    await createPeerConnection();
    state.dataChannel = state.pc.createDataChannel("chat");
    setupDataChannel(state.dataChannel);

    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
}

// --- Guest Flow ---
async function startGuest(externalData = null) {
    state.isHost = false;
    showScreen('connection-screen');
    
    if (externalData) {
        handleOfferData(externalData);
    } else {
        document.getElementById('step-2-join').classList.remove('hidden');
        initScanner("qr-reader", (text) => {
            const data = text.includes('?data=') ? text.split('?data=')[1] : text;
            handleOfferData(data);
        });
    }
}

async function handleOfferData(encodedSdp) {
    document.getElementById('step-2-join').classList.add('hidden');
    document.getElementById('step-3-answer').classList.remove('hidden');

    await createPeerConnection();
    const offer = JSON.parse(atob(encodedSdp));
    await state.pc.setRemoteDescription(offer);
    
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
}

// --- Manual Actions ---
function processManualOffer() {
    const code = document.getElementById('manual-paste-host').value.trim();
    if (code) handleOfferData(code);
}

function showManualInput(type) {
    document.getElementById('step-1-offer').classList.add('hidden');
    document.getElementById('manual-answer-input').classList.remove('hidden');
}

async function processManualAnswer() {
    const code = document.getElementById('manual-paste-answer').value.trim();
    if (code) {
        const answer = JSON.parse(atob(code));
        await state.pc.setRemoteDescription(answer);
    }
}

// --- Messaging ---
function sendMessage() {
    const input = document.getElementById('msg-input');
    if (!input.value.trim() || !state.dataChannel) return;

    const msg = {
        text: input.value,
        sender: state.username,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    state.dataChannel.send(JSON.stringify(msg));
    appendMessage(msg, 'sent');
    input.value = '';
}

function appendMessage(msg, side) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${side}`;
    div.innerHTML = `<div class="msg-text">${msg.text}</div><div style="font-size:10px; opacity:0.6; text-align:right">${msg.time}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// --- Utils ---
function showScreen(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function generateQR(id, text) {
    new QRCode(document.getElementById(id), { text: text, width: 200, height: 200 });
}

function initScanner(id, callback) {
    const scanner = new Html5QrcodeScanner(id, { fps: 10, qrbox: 250 });
    scanner.render((text) => {
        scanner.clear();
        callback(text);
    });
}

function copyCode(id) {
    const el = document.getElementById(id);
    el.select();
    navigator.clipboard.writeText(el.value);
    alert("Code Copied!");
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
}
