// bridge.js — Real-time state bridge for FlowSense AI (Ops <-> Fan App)

const FlowChannel = new BroadcastChannel('flowsense-ai');

window.FlowBridge = {
  /**
   * Broadcasts a state snapshot to all listeners
   * @param {Object} state - Current simulation state
   */
  broadcastState: (state) => {
    FlowChannel.postMessage({
      type: 'stateUpdate',
      payload: {
        zones: state.zones,
        alerts: state.alerts,
        emergencyMode: state.emergencyMode,
        matchPhase: state.matchPhase,
        totalInVenue: state.totalInVenue,
        matchMinute: state.matchMinute,
        safetyScore: state.safetyScore
      }
    });
  },

  /**
   * Registers a callback for state updates
   * @param {Function} callback 
   */
  onState: (callback) => {
    FlowChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'stateUpdate') {
        callback(event.data.payload);
      }
    };
  }
};

console.log('FlowBridge initialized');
