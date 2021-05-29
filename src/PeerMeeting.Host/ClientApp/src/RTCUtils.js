// Copyright 2021 Klabukov Erik.
// SPDX-License-Identifier: GPL-3.0-only

/* eslint-disable */
var RTCUtils = {
  ConfigureBase: function (connection, participants,  streamEndedCallback = (event) =>{}) {
    connection.codecs.video = 'VP8'
    connection.session = {
      audio: true,
      video: true
    }
    connection.sdpConstraints.mandatory = {
      OfferToReceiveAudio: true,
      OfferToReceiveVideo: true
    }

    // Custom on stream ended event
    connection.onstreamended = function (event) {
      streamEndedCallback(event)
      var mediaElement = document.getElementById(event.streamid)
      if (mediaElement) {
        mediaElement.parentNode.removeChild(mediaElement)
      }
    }
    
    // Fix for clear participant cards who disconnected without event
    setInterval(() =>{
      var connectedParticipants = connection.getAllParticipants()
      for(const key of participants.keys()){
        if(connectedParticipants.indexOf(key) == -1 
          && connection.userid != key
          || (connection.peers[key] 
            && connection.peers[key].peer.connectionState === "failed"))
          streamEndedCallback({userid: key})
      }
    }, 5000)

    // overriding the event to replace the poster XD
    connection.onmute = function(e) {
      if (!e || !e.mediaElement) return
      if (e.muteType === 'both' || e.muteType === 'video') {
          e.mediaElement.hidden = true
      } else if (e.muteType === 'audio') {
          e.mediaElement.muted = true;
      }
    };

    // Overriding the event for fix mute local media element after unmute on all
    var originalOnUnmute = connection.onunmute
    connection.onunmute = function(e){
      originalOnUnmute(e)
      if(!e || !e.mediaElement) return
      if(e.userid == connection.userid)
        e.mediaElement.muted = true
      if(e.mediaElement.tagName == "VIDEO" && e.unmuteType == 'video')
        e.mediaElement.hidden = false
    }

  },
  // Configure media error event for try use another microfon or if webcam not available, connect without it
  // eslint-disable-next-line
  ConfigureMediaError: function (connection, DetectRTC, callback = (videoState, audioState) => { }) {
    connection.onMediaError = function (e) {
      var mPeer = connection.multiPeersHandler
      console.error('Media Error', e.message)

      //If all media device unvailable or not allowed
      if (e.message === 'Requested device not found' 
          || e.message === 'The object can not be found here.'
          || e.message === 'The request is not allowed by the user agent or the platform in the current context.'){
        connection.dontCaptureUserMedia = true
        callback(false, false)
        connection.join(connection.sessionid)
        return
      }

      // Fix Mic cuncurrent limit
      if (e.message === 'Concurrent mic process limit.') {
        if (DetectRTC.audioInputDevices.length <= 1) {
          alert(
            'Please select external microphone. Check github issue number 483.'
          )
          return
        }
        var secondaryMic = DetectRTC.audioInputDevices[1].deviceId
        connection.mediaConstraints.audio = {
          deviceId: secondaryMic
        }
        connection.join(connection.sessionid)
        return
      }

      // Case if webcam not available
      callback(false, true)
      connection.dontCaptureUserMedia = true
      navigator.getUserMedia(
        { audio: true, video: false },
        function (stream) {
          connection.addStream(stream)
          mPeer.onGettingLocalMedia(stream)
          connection.join(connection.sessionid)
        },
        function () { }
      )
    }
  },
  // Switch mute/unmute audio
  SwitchAudioMute: function(connection, state){
    connection.attachStreams.forEach( s =>{
      if(state)
        s.unmute("audio")
      else
        s.mute("audio")
    })
  },
  // Switch mute/unmute video
  SwitchVideoMute: function(connection, state){
    connection.attachStreams.forEach( s =>{
      if(state)
        s.unmute("video")
      else
        s.mute("video")
    })
  },
  // Start screen sharing or stop and back to video + audio or audio only or empty
  ScreenSharing: function(connection, state, mediaState, callback){
    connection.attachStreams.forEach(s => s.stop())
    console.log(connection.attachStreams)
    var mPeer = connection.multiPeersHandler
    var self = this
    if(state){
      //Getting screen stream with system audio
      navigator.mediaDevices.getDisplayMedia({video: true, audio: true})
      .then(function(screenStream){
        if(!mediaState.hasMicrophone){
          self.AddStream(connection, screenStream, mPeer, callback)
          return
        }
        //On succes getting microphone stream, for add to screen stream
        navigator.getUserMedia(
          { audio: true, video: false },
          function (microphoneStream) {
            screenStream.addTrack(microphoneStream.getAudioTracks()[0])
            self.AddStream(connection, screenStream, mPeer, callback)
          },
          function (e){
            console.error('screen sharing with mic error', e)
            self.AddStream(connection, screenStream, mPeer, callback)
        })
      }, function(e){console.error('screen sharing', e)});
      return
    }else{
      connection.attachStreams = []
      if(!mediaState.hasMicrophone && !mediaState.hasWebcam){
        self.CreateFakeStream(connection, mPeer, callback)
        return
      }

      if(mediaState.hasMicrophone && !mediaState.hasWebcam && connection.dontCaptureUserMedia){
        navigator.getUserMedia(
          { audio: true, video: false },
          function (stream) {
            self.AddStream(connection, stream, mPeer, callback)
          },
          function () { }
        )
        return
      }

      connection.addStream({
        audio: true,
        video: true,
        oneway: true,
        streamCallback: function(stream){
          mPeer.onGettingLocalMedia(stream)
        }
      })
      
    }
  },
  AddStream: function(connection, stream, mPeer, callback){
    connection.attachStreams = []
    connection.addStream(stream)
    mPeer.onGettingLocalMedia(stream)
    var event = self.CreateVideoElementEvent(connection.userid, stream)
    callback(event)
  },
  CreateFakeStream: function(connection, mPeer, callback){
    connection.attachStreams = []
    var emptyStream = new MediaStream()
    connection.addStream(emptyStream)
    mPeer.onGettingLocalMedia(emptyStream)
    var event = this.CreateVideoElementEvent(connection.userid, emptyStream)
    callback(event)
  },
  CreateVideoElementEvent: function(userid, stream){
    var video = document.createElement("video");
    video.srcObject = stream;
    video.id = stream.id
    video.autoplay=true
    video.playsinline=true
    video.muted=true
    return {
      userid: userid,
      streamid: stream.id,
      mediaElement: video
    }
  }
}

export default RTCUtils