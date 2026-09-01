/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: MIT-0 */

(function () {
  const {
    Stage,
    StageEvents,
    SubscribeType,
    JitterBufferMinDelay
  } = IVSBroadcastClient;

  const formEl = document.querySelector("form");
  const videoEl = document.querySelector("video");
  const spanEl = document.querySelector("span");
  let joinAttemptTimestamp = null;
  let stage = null;

  videoEl.addEventListener("loadeddata", (e) => {
    const ttv = performance.now() - joinAttemptTimestamp;
    spanEl.textContent = ttv.toFixed(2);
  });

  // ============================================================================
  // ADDED: Function to fetch token from API Gateway with geo-blocking & origin check
  // ============================================================================
  async function fetchTokenFromAPI() {

    const API_ENDPOINT = '{your-api-gateway-endpoint}'; // Replace with your API Gateway endpoint after deployment for key method

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch token');
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('Error fetching token:', error);
      alert('Failed to get token: ' + error.message);
      throw error;
    }
  }
  // ============================================================================

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();

    const strategy = {
      // Increases the jitter buffer to improve playback stability.
      // See "Changing Subscriber Jitter Buffer MinDelay":
      // https://docs.aws.amazon.com/ivs/latest/RealTimeUserGuide/real-time-streaming-optimization.html#real-time-streaming-configurations
      subscribeConfiguration: (participant) => {
        return {
          jitterBuffer: {
            minDelay: JitterBufferMinDelay.MEDIUM
          }
        };
      },

      stageStreamsToPublish() {
        return [];
      },

      shouldPublishParticipant() {
        return false;
      },

      shouldSubscribeToParticipant(participant) {
        return SubscribeType.AUDIO_VIDEO;
      }
    };

    if (stage) {
      await stage.leave();
    }

    // Fetch token from API
    const token = await fetchTokenFromAPI();
    
    stage = new Stage(token, strategy);

    stage.on(
      StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED,
      (participant, streams) => {
        videoEl.srcObject = new MediaStream();
        streams.forEach((stream) => {
          videoEl.srcObject.addTrack(stream.mediaStreamTrack);
        });
      }
    );

    try {
      joinAttemptTimestamp = performance.now();
      await stage.join();
    } catch (error) {
      console.log(error);
    }
  });
})();
