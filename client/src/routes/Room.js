import React, { useEffect, useRef } from 'react';
import io from 'socket.io-client';

const Room = (props) => {
    const userVideo = useRef();
    const partnerVideo = useRef();
    const peerRef = useRef();
    const socketRef = useRef();
    const otherUser = useRef();
    const userStream = useRef();

    useEffect(() => {
        navigator.mediaDevices
            .getUserMedia({ audio: true, video: true })
            .then((stream) => {
                userVideo.current.srcObject = stream;
                userStream.current = stream;

                // starts the socket and lets the creatpr join a room

                socketRef.current = io.connect('/');
                socketRef.current.emit('join room', props.match.params.roomID);

                //other user requests to join a room

                socketRef.current.on('other user', (userID) => {
                    callUser(userID);
                    otherUser.current = userID;
                });

                //user joins a room

                socketRef.current.on('user joined', (userID) => {
                    otherUser.current = userID;
                });

                // ask to join
                socketRef.current.on('offer', handleReceiveCall);

                //confirms user join
                socketRef.current.on('answer', handleAnswer);

                //mode of joining
                socketRef.current.on('ice-candidate', handleNewICECandidateMsg);
            });
    }, []);

    // get stream and attach it to peer. basically get my video and share it with a user on the other end
    const callUser = (userID) => {
        peerRef.current = createPeer(userID);

        //get tracks returns an array of information, in this case, video and audio
        userStream.current
            .getTracks()
            .forEach((track) =>
                peerRef.current.addTrack(track, userStream.current)
            );
    };

    const createPeer = (userID) => {
        const peer = new RTCPeerConnection({
            //stun helps us get through various online firewalls. Read mdn docs for details
            iceServers: [
                {
                    urls: 'stun:stun.stunprotocol.org',
                },
                {
                    urls: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com',
                },
            ],
        });
        peer.onicecandidate = handleICECandidateEvent;
        peer.ontrack = handleTrackEvent;
        peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

        return peer;
    };

    const handleNegotiationNeededEvent = (userID) => {
        peerRef.current
            .createOffer()
            .then((offer) => {
                return peerRef.current.setLocalDescription(offer);
            })
            .then(() => {
                const payload = {
                    target: userID,
                    caller: socketRef.current.id,
                    sdp: peerRef.current.localDescription,
                };
                socketRef.current.emit('offer', payload);
            })
            .catch((e) => console.log(e));
    };

    const handleReceiveCall = (incoming) => {
        peerRef.current = createPeer();
        const desc = new RTCSessionDescription(incoming.sdp);
        peerRef.current
            .setRemoteDescription(desc)
            .then(() => {
                userStream.current
                    .getTracks()
                    .forEach((track) =>
                        peerRef.current.addTrack(track, userStream.current)
                    );
            })
            .then(() => {
                return peerRef.current.createAnswer();
            })
            .then((answer) => {
                return peerRef.current.setLocalDescription(answer);
            })
            .then(() => {
                const payload = {
                    target: incoming.caller,
                    caller: socketRef.current.id,
                    sdp: peerRef.current.localDescription,
                };
                socketRef.current.emit('answer', payload);
            });
    };

    const handleAnswer = (message) => {
        const desc = new RTCSessionDescription(message.sdp);
        peerRef.current.setRemoteDescription(desc).catch((e) => console.log(e));
    };

    const handleICECandidateEvent = (e) => {
        if (e.candidate) {
            const payload = {
                target: otherUser.current,
                candidate: e.candidate,
            };
            socketRef.current.emit('ice-candidate', payload);
        }
    };

    const handleNewICECandidateMsg = (incoming) => {
        const candidate = new RTCIceCandidate(incoming);

        peerRef.current.addIceCandidate(candidate)
            .catch(e => console.log(e));
    };

    const handleTrackEvent = (e) => {
        partnerVideo.current.srcObject = e.streams[0];
    };

    return (
        <div>
            <video autoPlay ref={userVideo} />
            <video autoPlay ref={partnerVideo} />
        </div>
    );
};

export default Room
