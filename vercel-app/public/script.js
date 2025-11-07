/*
 * Discord Clone Prototype (Vercel version)
 *
 * This script provides client‑side logic for joining a room, establishing
 * WebRTC connections, handling audio/video streams, and toggling
 * screen sharing. It uses the API endpoints served by the Express server
 * deployed on Vercel (/api/join, /api/send, /api/poll, /api/leave) to
 * exchange signalling messages via long‑polling.
 */

// DOM elements
const roomInput = document.getElementById('roomId');
const resolutionSelect = document.getElementById('resolution');
const fpsSelect = document.getElementById('fps');
const joinBtn = document.getElementById('joinBtn');
const toggleScreenShareBtn = document.getElementById('toggleScreenShare');
const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideos');

// Generate a random peer ID
const peerId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// Global state
let roomId = null;
let localStream = null;
let screenStream = null;
let currentStream = null;
const peers = {};
let polling = false;

// Create new peer connection
function createPeerConnection(remotePeerId) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  });
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage(remotePeerId, 'ice-candidate', event.candidate);
    }
  };
  pc.ontrack = (event) => {
    let remoteVideo = document.getElementById(`remote-${remotePeerId}`);
    if (!remoteVideo) {
      remoteVideo = document.createElement('video');
      remoteVideo.id = `remote-${remotePeerId}`;
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideosContainer.appendChild(remoteVideo);
    }
    remoteVideo.srcObject = event.streams[0];
  };
  pc.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      cleanupPeer(remotePeerId);
    }
  };
  return pc;
}

function cleanupPeer(remotePeerId) {
  const pc = peers[remotePeerId];
  if (pc) {
    pc.close();
    delete peers[remotePeerId];
  }
  const remoteVideo = document.getElementById(`remote-${remotePeerId}`);
  if (remoteVideo) {
    remoteVideo.remove();
  }
}

async function getUserMediaStream() {
  const res = parseInt(resolutionSelect.value, 10);
  const fps = parseInt(fpsSelect.value, 10);
  const constraints = {
    audio: true,
    video: {
      width: res === 2160 ? { ideal: 3840 } : { ideal: res === 1080 ? 1920 : 1280 },
      height: res === 2160 ? { ideal: 2160 } : { ideal: res === 1080 ? 1080 : 720 },
      frameRate: { ideal: fps },
    },
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

async function startLocalStream() {
  localStream = await getUserMediaStream();
  currentStream = localStream;
  localVideo.srcObject = currentStream;
}

function replaceTracks(stream) {
  Object.values(peers).forEach((pc) => {
    pc.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
        pc.removeTrack(sender);
      }
    });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  });
}

async function toggleScreenShare() {
  if (!screenStream) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: parseInt(fpsSelect.value, 10) } },
        audio: false,
      });
      screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        stopScreenShare();
      });
      currentStream = screenStream;
      localVideo.srcObject = currentStream;
      replaceTracks(currentStream);
      toggleScreenShareBtn.textContent = 'Stop Screen Share';
    } catch (err) {
      console.error('Error starting screen share', err);
    }
  } else {
    stopScreenShare();
  }
}

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
    currentStream = localStream;
    localVideo.srcObject = currentStream;
    replaceTracks(currentStream);
    toggleScreenShareBtn.textContent = 'Toggle Screen Share';
  }
}

async function sendMessage(to, type, data) {
  try {
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, type, data, from: peerId }),
    });
  } catch (err) {
    console.error('Send message failed', err);
  }
}

async function joinRoom() {
  roomId = roomInput.value.trim();
  if (!roomId) {
    alert('Please enter a room ID');
    return;
  }
  joinBtn.disabled = true;
  await startLocalStream();
  try {
    const resp = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, peerId }),
    });
    const result = await resp.json();
    const existingPeers = result.existingPeers || [];
    // Start polling
    if (!polling) {
      polling = true;
      pollMessages();
    }
    for (const otherId of existingPeers) {
      await callPeer(otherId);
    }
  } catch (err) {
    console.error('Join failed', err);
  }
}

async function leaveRoom() {
  if (!roomId) return;
  try {
    await fetch('/api/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, peerId }),
    });
  } catch (err) {
    console.error('Leave failed', err);
  }
  Object.keys(peers).forEach((id) => cleanupPeer(id));
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  stopScreenShare();
  currentStream = null;
  roomId = null;
  joinBtn.disabled = false;
  polling = false;
}

async function pollMessages() {
  while (polling) {
    try {
      const resp = await fetch(`/api/poll?peerId=${encodeURIComponent(peerId)}`);
      const result = await resp.json();
      const messages = result.messages || [];
      for (const msg of messages) {
        await handleMessage(msg);
      }
    } catch (err) {
      console.error('Polling error', err);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function handleMessage(msg) {
  const { type, from, data } = msg;
  switch (type) {
    case 'peer-connected':
      await callPeer(from);
      break;
    case 'peer-disconnected':
      cleanupPeer(from);
      break;
    case 'offer':
      await answerCall(from, data);
      break;
    case 'answer':
      await acceptAnswer(from, data);
      break;
    case 'ice-candidate':
      addIceCandidate(from, data);
      break;
    default:
      console.warn('Unknown message type', type);
  }
}

async function callPeer(remotePeerId) {
  if (peers[remotePeerId]) return;
  const pc = createPeerConnection(remotePeerId);
  peers[remotePeerId] = pc;
  currentStream.getTracks().forEach((track) => pc.addTrack(track, currentStream));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendMessage(remotePeerId, 'offer', offer);
}

async function answerCall(remotePeerId, offer) {
  let pc = peers[remotePeerId];
  if (!pc) {
    pc = createPeerConnection(remotePeerId);
    peers[remotePeerId] = pc;
    currentStream.getTracks().forEach((track) => pc.addTrack(track, currentStream));
  }
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await sendMessage(remotePeerId, 'answer', answer);
}

async function acceptAnswer(remotePeerId, answer) {
  const pc = peers[remotePeerId];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

function addIceCandidate(remotePeerId, candidate) {
  const pc = peers[remotePeerId];
  if (pc) {
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => console.error('ICE error', err));
  }
}

joinBtn.addEventListener('click', () => {
  if (!roomId) joinRoom();
});
toggleScreenShareBtn.addEventListener('click', toggleScreenShare);
window.addEventListener('beforeunload', () => {
  leaveRoom();
});
