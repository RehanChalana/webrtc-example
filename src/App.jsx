import { useState, useEffect, useRef } from 'react'
import "./app.css"


function App() {
  
  const [msgInput, setMsgInput] = useState("")
  const [messages,setMessages] = useState([])
  const [offered,setOffered] = useState(false)
  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const chatChannelRef = useRef(null)
  const peerIdRef = useRef(Math.random().toString(36).substring(2, 15));
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)



  const enableMedia = async() => {
    let stream = await navigator.mediaDevices.getUserMedia({'video':true,'audio':true})
    localVideoRef.current.srcObject = stream

    return stream
  }


  const connectToSignalingServer = () => {
    let ws = new WebSocket('ws://localhost:8080/ws/signaling')
    ws.onopen = (e) => console.log("Connected to the signaling server")
    ws.onerror = (e) => console.error("Web socket error: ", e)
    ws.onclose = (e) => console.log("Web socket connection is closed")


    ws.onmessage = (msg) => {

      console.log(msg)
      let message = JSON.parse(msg.data)

      switch(message.type) {
        case "offer": 
          if(message.peerId !== peerIdRef.current) handleOffer(message.sdp)
          break
        case "answer":
          if(peerIdRef.current !== message.peerId) handleAnswer(message.sdp)
          break
        case "candidate":
          if(peerIdRef.current !== message.peerId && pcRef.current ) {
            const candidate = new RTCIceCandidate(message.candidate)
            console.log(pcRef.current)
            pcRef.current.addIceCandidate(candidate)
          }
          break
        default :
          console.log("unknown message received!")
          break
      }
    }

    socketRef.current = ws
  }

  const handleOffer = async(offerSDP) => {

    const stream = await enableMedia()
    let pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    })

    pcRef.current = pc

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      remoteVideoRef.current.srcObject = remoteStream
    }

    stream.getTracks().forEach(track => {
      pc.addTrack(track,stream)
    })

    await pc.setRemoteDescription(new RTCSessionDescription(offerSDP))

   
    pc.ondatachannel = (e) => {
      let cc = e.channel
      chatChannelRef.current = cc
      
      cc.onopen = (e) => console.log("Data channel opened")
      cc.onmessage = (m) => {
        setMessages((prevMessages) => [...prevMessages,m.data])
      }
      cc.onclose = (e) => console.log("Chat channel closed")
    }

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    socketRef.current.send(JSON.stringify({type : "answer", sdp: answer, peerId: peerIdRef.current}))

    

    console.log("offer received! sending answer")

    pc.onicecandidate = (event) => {
      if(event.candidate) {
        socketRef.current.send(JSON.stringify({type: "candidate", candidate: event.candidate, peerId: peerIdRef.current}))
      }
    }
    
  }

  const handleAnswer = async(answerSDP) => {
    if(!pcRef.current) {
      console.log("answer received before sending an offer")
      return
    }


    pcRef.current.onicecandidate = (event) => {
      if(event.candidate) {
        socketRef.current.send(JSON.stringify({
          type : "candidate",
          candidate: event.candidate,
          peerId: peerIdRef.current
        }))
      }
    }

    try {
      if (pcRef.current.signalingState === "have-local-offer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerSDP));
        console.log("Answer received!");
        console.log(pcRef.current.connectionState)
      } else {
        console.log("Invalid signaling state for setting remote description:", pcRef.current.signalingState);
      }
    } catch(error) {
      console.error("Error on receiving answer: ", error)
    }


  }


  const sendOffer = async() => {
    try {
      if(offered) return

      const stream = await enableMedia()

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      })

      // adding media tracks to the RTC peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track,stream)
      })

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams
        remoteVideoRef.current.srcObject = remoteStream
      }

      const cc = pc.createDataChannel("channel")

      cc.onmessage = (msg) => {
        setMessages((prevMessages) => [...prevMessages,msg.data])
      }

      cc.onopen = (e) => console.log("Chat Channel opened!")

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      socketRef.current.send(JSON.stringify({type: "offer", sdp: offer, peerId: peerIdRef.current}))

      
      

      chatChannelRef.current = cc
      pcRef.current = pc
      setOffered(true)
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
