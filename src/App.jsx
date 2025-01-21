import { useState, useEffect, useRef } from 'react'


function App() {
  
  const [msgInput, setMsgInput] = useState("")
  const [messages,setMessages] = useState([])
  const [isInitiator, setIsInitiator] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const chatChannelRef = useRef(null)
  const peerIdRef = useRef(Math.random().toString(36).substring(2, 15));
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const turnServerUsername = import.meta.env.VITE_TURN_SERVER_USERNAME
  const turnServerPassword = import.meta.env.VITE_TURN_SERVER_PASSWORD

  const enableMedia = async() => {
    try {

      const mediaConstraints = {
        video: {
          width: { ideal: 1280 }, // HD resolution
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 }, 
          facingMode: "user" 
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      }


      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
      localVideoRef.current.srcObject = stream
      return stream
    } catch(error) {
      console.error("Error accessing media devices: ", error)
    }
  }

  const connectToSignalingServer = () => {
    const signalingServerUrl = import.meta.env.VITE_SIGNALING_SERVER
    let ws = new WebSocket(signalingServerUrl)
    ws.onopen = () => console.log("Connected to the signaling server")
    ws.onerror = (e) => console.error("Web socket error: ", e)
    ws.onclose = () => console.log("Web socket connection is closed")


    ws.onmessage = async(msg) => {
      let message = JSON.parse(msg.data)
      console.log(message)

      switch(message.type) {
        case "offer": 
          if(message.peerId !== peerIdRef.current && !isConnected) {
            await handleOffer(message.sdp)
          }
          break
        case "answer":
          if(peerIdRef.current !== message.peerId) {
            await handleAnswer(message.sdp)
          }
          break
        case "candidate":
          if(peerIdRef.current !== message.peerId && pcRef.current ) {
            try {
              const candidate = new RTCIceCandidate(message.candidate)
              await pcRef.current.addIceCandidate(candidate)
            } catch(error) {
              console.error("Error adding ice candidate: ", error)
            }
          }
          break
        default :
          console.log("unknown message received!")
          break
      }
    }

    socketRef.current = ws
  }

  const createPeerConnection = async() => {
    const stream = await enableMedia()
    const pc = new RTCPeerConnection({
      iceServers: [ 
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.l.google.com:5349" },
      { urls: "stun:stun1.l.google.com:3478" },
      { urls: "stun:stun1.l.google.com:5349" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:5349" },
      { urls: "stun:stun3.l.google.com:3478" },
      { urls: "stun:stun3.l.google.com:5349" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:5349" },
      {urls: "stun:stun.relay.metered.ca:80"},
      {
        urls: "turn:global.relay.metered.ca:80",
        username: turnServerUsername,
        credential: turnServerPassword,
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: turnServerUsername,
        credential: turnServerPassword,
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: turnServerUsername,
        credential: turnServerPassword,
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: turnServerUsername,
        credential: turnServerPassword,
      },
      
      ]
    })

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams
      remoteVideoRef.current.srcObject = remoteStream
    }

    stream.getTracks().forEach((track) => {
      pc.addTrack(track,stream)
    })

    pc.onicecandidate = (event) => {
      if(event.candidate) {
      socketRef.current.send(JSON.stringify({type : "candidate", candidate : event.candidate, peerId : peerIdRef.current}))
      }
    }

    pc.onconnectionstatechange = () => {
      if(pc.connectionState === "connected") {
        setIsConnected(true)
      }
    }

    return pc
  }

  const handleOffer = async(offerSDP) => {
    try {
      const pc = await createPeerConnection()
      pcRef.current = pc

      await pc.setRemoteDescription(new RTCSessionDescription(offerSDP))

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      socketRef.current.send(JSON.stringify({type : "answer", sdp: answer, peerId: peerIdRef.current}))

      console.log("offer received and answer sent!")
    } catch(error) {
      console.error("Error handling the offer")
    }
  }

  const handleAnswer = async(answerSDP) => {
    try {
      if(!pcRef.current) {
        console.error("no peer connection exists")
        return
      }
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerSDP))
      console.log("answer received")
    } catch(error) {
      console.error("Error on receiving answer: ", error)
    }
  }


  const sendOffer = async() => {
    try {
      if(isConnected) {
        console.log("Already Connected")
        return
      }

      setIsInitiator(true)

      const pc = await createPeerConnection()
      pcRef.current = pc

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      socketRef.current.send(JSON.stringify({type: "offer", sdp: offer, peerId: peerIdRef.current}))


      console.log("offer sent!")
      
    } catch(error) {
      console.error("Error creating an offer: ", error)
    }
    
  }

  const sendMessage = () => {
    if(!chatChannelRef.current) {
      alert("Please make a connection first")
      return
    }

    chatChannelRef.current.send(msgInput)
    setMessages((prevMessages) => [...prevMessages,msgInput])
    setMsgInput("")
  }

  useEffect(() => {
    connectToSignalingServer()
  },[])
  

  return (
    <div className="app bg-[#1A1A1A] h-screen text-[#d9d9d9] flex flex-col items-center justify-around">

      <div className=''>
        <h1 className='font-semibold text-5xl p-4'>Web RTC demo</h1>
      </div>

      <div className=' w-screen p-4 flex gap-2 justify-center '>
          <video autoPlay playsInline muted ref={localVideoRef} className='border-2 aspect-video flex-1  max-w-xl'></video>
          <video autoPlay playsInline ref={remoteVideoRef} className='border-2 aspect-video max-w-xl flex-1 '></video>
      </div>

      <div className='border-2 p-2 mt-4 font-semibold text-xl rounded-xl hover:bg-white hover:text-[#1A1A1A]'>
          <button onClick={sendOffer}>Start Call</button>
      </div>
      
      
      

      {/* <label>Send a message</label> */}
      {/* <h1>Chat Log</h1>
      {messages.map((m) => {
        return <div>{m}</div>
      })} */}
      {/* <input type="text" onChange={(e) => setMsgInput(e.target.value)} value={msgInput}></input>
      <button onClick={sendMessage}>send a message</button> */}

    </div>
  )
}

export default App
