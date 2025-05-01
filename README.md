Overview: 
This project is a secure peer-to-peer (P2P) chat application built using modern web technologies including WebRTC for P2P data transmission, 
WebSocket for signaling, and the Web Crypto API for secure message encryption. The goal is to demonstrate how two clients can communicate directly and 
securely without routing messages through a central server.


Step by step explanation of the project flow:
Client connects to signaling server via WebSocket
Clients join a chat room using a password-derived room ID (SHA-256)
WebRTC connection is negotiated through signaling messages
ECDH key pairs are exchanged via DataChannel
A shared AES key is derived and used to encrypt/decrypt chat messages
Messages are transmitted securely over the established P2P connection
