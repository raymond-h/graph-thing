import React, { Component } from 'react';
import Rx from 'rxjs/Rx';
import io from 'socket.io-client';

import { LineChart } from 'react-easy-chart';

import './App.css';

async function fetchAll(socket, id) {
  return new Promise(resolve => {
    socket.emit('fetch', id, resolve);
  });
}

async function subscribe(socket, id) {
  return new Promise(resolve => {
    socket.emit('subscribe', id, resolve);
  });
}

function applyUpdate(data, update) {
  const out = [...data];

  if(update.old_val == null) {
    out.push(update.new_val);
  }
  else {
    const idx = out.findIndex(row => row.id === update.old_val.id);

    if(update.new_val == null) {
      out.splice(idx, 1);
    }
    else {
      out.splice(idx, 1, update.new_val);
    }
  }

  return out;
}

function stateSyncObs(socket, id) {
  return Rx.Observable.defer(() =>
    Rx.Observable.from(fetchAll(socket, id))
    .mergeMap(data =>
      Rx.Observable.from(subscribe(socket, id))
      .mapTo(data)
    )
    .concatMap(initial =>
      Rx.Observable.fromEvent(socket, 'update')
      .scan(applyUpdate, initial)
      .startWith(initial)
    )
  );
}

class App extends Component {
  constructor(props) {
    super(props);
    this.socket = null;
    this.sub = null;
    this.state = { text: '', data: [] };
  }

  async componentDidMount() {
    const res = await fetch('/api/test');
    const text = await res.text();
    this.setState({ text });

    this.socket = io({
      path: '/api/socket.io'
    });

    this.sub =
      stateSyncObs(this.socket, 'hurr-durr')
      .subscribe(data => {
        this.setState({ data });
      });
  }

  render() {
    return (
      <div className="App">
        <LineChart
          axes
          grid
          verticalGrid
          xType={'time'}
          datePattern={'%Q'}
          margin={{ top: 10, bottom: 100, left: 100, right: 10 }}
          width={600}
          height={400}
          data={[
            this.state.data.map(val => {
              return {
                x: Date.parse(val.time),
                y: val.value
              }
            })
          ]}
          />
      </div>
    );
  }
}

export default App;
