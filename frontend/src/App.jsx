import React, { Component } from 'react';
import io from 'socket.io-client';

import logo from './logo.svg';
import './App.css';

class App extends Component {
  constructor(props) {
    super(props);
    this.socket = null;
    this.state = { text: '' };
  }

  async componentDidMount() {
    const res = await fetch('/api/test');
    const text = await res.text();
    this.setState({ text });

    this.socket = io({
      path: '/api/socket.io'
    });

    this.socket.on('connect', () => {
      this.socket.emit('subscribe', 'hurr-durr');
    });
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome to React</h1>
        </header>
        <p className="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
        <p>
          { this.state.text }
        </p>
      </div>
    );
  }
}

export default App;
