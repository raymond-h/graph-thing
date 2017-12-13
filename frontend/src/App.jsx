import React, { Component } from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
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

// Props:
//   socket: socket.io instance
//   id: graph ID
class GraphDisplayer extends Component {
  constructor(props) {
    super(props);

    this.propsSubj = new Rx.BehaviorSubject(props);
    this.state = { data: [] };
  }

  componentWillReceiveProps(nextProps) {
    this.propsSubj.next(nextProps);
  }

  componentDidMount() {
    this.sub =
      this.propsSubj
      .distinctUntilChanged()
      .switchMap(props => {
        console.log(props);
        return stateSyncObs(props.socket, props.id);
      })
      .subscribe(data => {
        this.setState({ data });
      });
  }

  render() {
    const updateUrl = `${window.location.origin}/api/update/${this.props.id}`;

    return <div>
      <LineChart
        axes
        grid
        verticalGrid
        xType={'time'}
        datePattern={'%Q'}
        margin={{ top: 10, bottom: 40, left: 40, right: 10 }}
        width={1024}
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

      <p>
        To update this graph, send a <code>PUSH</code> request to <code>{updateUrl}</code>
      </p>
      <p>
        It accepts JSON (<code>{'{"value":5.9}'}</code>) and HTTP form (<code>value=5.9</code>) formats.
        Keep in mind to set proper <code>Content-Type</code> header!
      </p>
    </div>;
  }
}

class App extends Component {
  constructor(props) {
    super(props);
    this.socket = io({
      path: '/api/socket.io'
    });
    this.state = { text: '' };
  }

  async componentDidMount() {
    const res = await fetch('/api/test');
    const text = await res.text();
    this.setState({ text });
  }

  render() {
    return (
      <BrowserRouter>
        <div className="App">
          <Route path="/graph/:graphId" render={props => (
            <GraphDisplayer socket={this.socket} id={props.match.params.graphId} />
          )} />
        </div>
      </BrowserRouter>
    );
  }
}

export default App;
