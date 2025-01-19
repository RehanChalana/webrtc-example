import { useState, useEffect, useRef } from 'react'
import "./app.css"


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



  const enableMedia = async() => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({'video':true,'audio':true})
      localVideoRef.current.srcObject = stream
      return stream
    } catch(error) {
      console.error("Error accessing media devices: ", error)
    }
  }

  const connectToSignalingServer = () => {
    let ws = new WebSocket('ws://00b5-152-59-84-79.ngrok-free.app/ws/signaling')
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
      iceServers: [ { urls: 'stun:stun.l.google.com:19302' }]
    })

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams
      remoteVideoRef.current.srcObject = remoteStream
    }

    stream.getTracks().forEach((track) => {
      pc.addTrack(track,stream)
    })

    pc.onicecandidate = (event) => {
      socketRef.current.send({type : "candidate", candidate : event.candidate, peerId : peerIdRef.current})
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

      pc.ondatachannel = (e) => {
        let cc = e.channel
        chatChannelRef.current = cc
        cc.onopen = (e) => console.log("Data channel opened")
        cc.onmessage = (m) => {
          setMessages((prevMessages) => [...prevMessages,m.data])
        }
        cc.onclose = (e) => console.log("Chat channel closed")
      }

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
      await setRemoteDescription(new RTCSessionDescription(answerSDP))
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

      const cc = pc.createDataChannel("channel")
      chatChannelRef.current = cc

      cc.onmessage = (msg) => {
        setMessages((prevMessages) => [...prevMessages,msg.data])
      }

      cc.onopen = (e) => console.log("Chat Channel opened!")

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
    <div className="app">
      <h1>Web RTC demo</h1>
      <h1>Chat Log</h1>
      {messages.map((m) => {
        return <div>{m}</div>
      })}

      <label>Send a message</label>
      <input type="text" onChange={(e) => setMsgInput(e.target.value)} value={msgInput}></input>
      <button onClick={sendMessage}>send a message</button>

      <video autoPlay playsInline muted ref={localVideoRef}></video>
      <video autoPlay playsInline ref={remoteVideoRef}></video>
      <button onClick={sendOffer}>Send Offer</button>
    </div>
  )
}

export default App
