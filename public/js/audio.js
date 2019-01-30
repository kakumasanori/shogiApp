// (() => {

  'use strict';

  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContext();

  let getAudioBuffer = (url, func) => {
    let req = new XMLHttpRequest();

    req.responseType = 'arraybuffer';

    req.onreadystatechange = () => {
      if (req.readyState === 4) {
        if (req.status === 0 || req.status === 200) {
          context.decodeAudioData(req.response, buffer => {
            func(buffer);
          });
        }
      }
    };

    req.open('GET', url, true);
    req.send('');
  };

  let playSound = buffer => {
    let source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  };

  window.onload = () => {
    getAudioBuffer('se.mp3', buffer => {
      let btn = document.getElementById('btn');
      btn.addEventListener('click', () => {
        playSound(buffer);
      });
    });
  };

  export default function() {
    console.log('export default!');
  }

// })();
