const ws = new WebSocket('ws://localhost:3000'); // Signaling server
let peerConnection;
let dataChannel;

let localNickname = '';
let aesKey;
let ecdhKeyPair;
let peerPublicKey;
let roomHash = '';

const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('sendBtn');
const joinBtn = document.getElementById('joinBtn');

// Disable send until connection is ready
sendBtn.disabled = true;

sendBtn.onclick = async () => {
    const msg = messageInput.value;
    if (!msg || !aesKey) return;

    const encrypted = await encryptMessage(msg);
    dataChannel.send(JSON.stringify({
        type: "chat",
        nickname: localNickname,
        message: encrypted
    }));

    appendMessage(localNickname, msg);
    messageInput.value = '';
};

joinBtn.onclick = async () => {
    localNickname = document.getElementById('nickname').value;
    const password = document.getElementById('password').value;
    if (!localNickname || !password) return alert("Please enter nickname and password.");
    // Create room hash from password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    roomHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    // Generate ECDH key pair
    ecdhKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"]
    );
    ws.send(JSON.stringify({ type: 'join', hash: roomHash }));

    document.getElementById('auth').style.display = 'none';
    document.getElementById('chat').style.display = 'block';
};

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'offer') {
        await createPeer(false);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', answer, hash: roomHash }));
    }

    if (data.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }

    if (data.type === 'candidate') {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }

    if (data.type === 'ready') {
        await createPeer(true);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', offer, hash: roomHash }));
    }
};

async function createPeer(isInitiator) {
    peerConnection = new RTCPeerConnection();

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            ws.send(JSON.stringify({ type: 'candidate', candidate: e.candidate, hash: roomHash }));
        }
    };

    if (isInitiator) {
        dataChannel = peerConnection.createDataChannel("chat");
        setupDataChannel();
    } else {
        peerConnection.ondatachannel = (e) => {
            dataChannel = e.channel;
            setupDataChannel();
        };
    }
}

function setupDataChannel() {
    dataChannel.onopen = async () => {
        console.log("🔗 DataChannel Open");
        sendBtn.disabled = false;

        const exportedKey = await crypto.subtle.exportKey("raw", ecdhKeyPair.publicKey);
        dataChannel.send(JSON.stringify({
            type: "key-exchange",
            nickname: localNickname,
            publicKey: Array.from(new Uint8Array(exportedKey))
        }));
    };

    dataChannel.onmessage = async (e) => {
        const data = JSON.parse(e.data);

        if (data.type === "key-exchange") {
            const peerKeyBytes = new Uint8Array(data.publicKey);
            peerPublicKey = await crypto.subtle.importKey(
                "raw", peerKeyBytes,
                { name: "ECDH", namedCurve: "P-256" },
                false,
                []
            );

            aesKey = await crypto.subtle.deriveKey(
                { name: "ECDH", public: peerPublicKey },
                ecdhKeyPair.privateKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"]
            );

            console.log(" AES key established via ECDH!");
        }

        if (data.type === "chat") {
            const decrypted = await decryptMessage(data.message);
            appendMessage(data.nickname, decrypted);
        }
    };
}

function appendMessage(nickname, message) {
    chatBox.innerHTML += `<p><strong>${nickname}:</strong> ${message}</p>`;
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function encryptMessage(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
    return btoa(JSON.stringify({
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(ciphertext))
    }));
}

async function decryptMessage(encrypted) {
    const payload = JSON.parse(atob(encrypted));
    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, data);
    return new TextDecoder().decode(decrypted);
}
