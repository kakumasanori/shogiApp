(() => {

  'use strict';

  const icons = document.getElementsByClassName('fas');
  const volume = document.getElementById('volume');

  icons[0].addEventListener('click', () => {
    icons[0].classList.add('hidden');
    if (volume.old <= 50) {
      icons[1].classList.remove('hidden');
    } else {
      icons[2].classList.remove('hidden');
    }
    volume.value = volume.old;
  });

  icons[1].addEventListener('click', () => {
    icons[0].classList.remove('hidden');
    icons[1].classList.add('hidden');
    volume.old = volume.value;
    volume.value = 0;
  });

  icons[2].addEventListener('click', () => {
    icons[0].classList.remove('hidden');
    icons[2].classList.add('hidden');
    volume.old = volume.value;
    volume.value = 0;
  });

  volume.addEventListener('change', () => {
    if (volume.value == 0) {
      icons[0].classList.remove('hidden');
      icons[1].classList.add('hidden');
      icons[2].classList.add('hidden');
    }
    else if (volume.value <= 50) {
      icons[0].classList.add('hidden');
      icons[1].classList.remove('hidden');
      icons[2].classList.add('hidden');
      volume.old = volume.value;
    }
    else {
      icons[0].classList.add('hidden');
      icons[1].classList.add('hidden');
      icons[2].classList.remove('hidden');
      volume.old = volume.value;
    }
  });

  // window.AudioContext = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContext();

  function getAudioBuffer(url, callback) {
    const request = new XMLHttpRequest();
    request.responseType = 'arraybuffer';
    request.onreadystatechange = () => {
      if (request.readyState === 4) {
        if (request.status === 0 || request.status === 200) {
          context.decodeAudioData(request.response, buffer => {
            callback(buffer);
          });
        }
      }
    };
    request.open('GET', url, true);
    request.send();
  }

  function playSound(buffer) {
    const gain = context.createGain();
    gain.gain.value = volume.value / 100;
    gain.connect(context.destination);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);

    source.start(0);
  };

  const socket = io.connect();

  const PLAYER1 = 1;
  const PLAYER2 = 2;

  const standA = document.getElementById('stand_a');
  const board = document.getElementById('board');
  const standB = document.getElementById('stand_b');

  const clockA = document.getElementById('clock_a');
  const clockB = document.getElementById('clock_b');
  const resignation = document.getElementById('resignation');
  const information = document.getElementById('information');

  let player;
  let black;
  let stand1;
  let stand2;
  let clock1;
  let clock2;

  let timerID;
  let time1;
  let time2;
  let turn;
  let latest;
  let winner;

  let timeoutID;
  let waitingTime = 0;

  let draggedPiece;
  let draggedPieceID;
  let draggedSquareID;
  let droppableRanges = [];

  let squareElements = [];
  let currentSquareData = [];
  let currentStand1Data = [];
  let currentStand2Data = [];

  initData();
  setSquare();

  socket.emit('join_room');

  socket.on('set_player', num => {
    player = num;
    if (player === PLAYER1) {
      stand1 = standB;
      stand2 = standA;
      clock1 = clockB;
      clock2 = clockA;
      stand1.className = 'stand player1';
      stand2.className = 'stand player2';
      information.className = 'information player1';
      information.textContent = '対局相手を待っています';
    } else {
      stand1 = standA;
      stand2 = standB;
      clock1 = clockA;
      clock2 = clockB;
      stand1.className = 'stand player1';
      stand2.className = 'stand player2';
      information.className = 'information player2';
      information.textContent = '対局相手を待っています';
    }

    socket.on('unset_player', num => {
      if (player === num) {
        socket.disconnect();
        information.textContent = '接続が切れました';
      }
    });

    socket.on('ready', () => {
      socket.emit('ready');
    });

    socket.on('start_game', () => {
      setTurn();
      socket.emit('set_up', {
        turn: turn
      });
    });

    socket.on('really', num => {
      if (player === num) {
        socket.emit('exists', num);
      }
    });

    socket.on('check_started', () => {
      timeoutID = setTimeout(checkStarted, 1000);
    });
  });

  socket.on('set_up', data => {
    setUp(data);
    setPiece(currentSquareData);
  });

  socket.on('respond_data', data => {
    setUp(data);
    updateGame(data);
  });

  socket.on('end_of_the_game', data => {
    winner = data.winner;
    if (player) {
      if (player === winner) {
        information.textContent = 'あなたの勝ちです';
      } else {
        information.textContent = 'あなたの負けです';
      }
    } else {
      if (black === winner) {
        information.textContent = '先手の勝ちです';
      } else {
        information.textContent = '後手の勝ちです';
      }
    }
    socket.disconnect();
  });

  resignation.addEventListener('click', () => {
    if (winner || player !== turn || !window.confirm('投了しますか？')) {
      return;
    }
    winner = player === PLAYER1 ? PLAYER2 : PLAYER1;
    socket.emit('end_of_the_game', {
      winner: winner
    });
  }, false);

  function setTurn() {
    const arr = [PLAYER1, PLAYER2];
    const n = Math.floor(Math.random() * arr.length);
    turn = arr[n];
  }

  function setUp(data) {
    black = data.black || data.turn;
    time1 = data.time1 || 300;
    time2 = data.time2 || 300;
    turn = data.turn;
    if (player) {
      setUpForPlayer();
      updateInformation();
      timerID = setTimeout(updateTime, 1000);
    } else {
      setUpForSpectator();
    }

    socket.on('request_data', socketID => {
      if (player) {
        socket.emit('respond_data', socketID, {
          black: black,
          time1: time1,
          time2: time2,
          turn: turn,
          latest: latest,
          squareData: currentSquareData,
          stand1Data: currentStand1Data,
          stand2Data: currentStand2Data
        });
      }
    });

    socket.on('update_time1', data => {
      time1 = data.time1;
      updateClock(clock1, time1);
    });

    socket.on('update_time2', data => {
      time2 = data.time2;
      updateClock(clock2, time2);
    });

    socket.on('update_game', data => {
      getAudioBuffer('se.mp3', playSound);
      if (turn === PLAYER1) {
        time1 += 5;
        turn = PLAYER2;
      } else {
        time2 += 5;
        turn = PLAYER1;
      }
      updateGame(data);
    });

    socket.on('wait', num => {
      if (player === num) {
        return;
      }
      if (num === 1) {
        clock1.className = 'clock disconnected';
      } else {
        clock2.className = 'clock disconnected';
      }
      if (player) {
        clearTimeout(timeoutID);
        waitingTime = 0;
        timeoutID = setTimeout(checkWaitingTime, 1000);
      }
      if (clock1.className === clock2.className) {
        socket.disconnect();
        information.textContent = '対局者の接続が切れました';
      }
    });

    socket.on('exists', num => {
      if (num === 1) {
        clock1.className = 'clock';
      } else {
        clock2.className = 'clock';
      }
      if (player) {
        clearTimeout(timeoutID);
      }
    });
  }

  function setUpForPlayer() {
    if (player === black) {
      board.className = 'black';
    } else {
      board.className = 'white';
    }
    if (player === PLAYER1) {
      resignation.className = 'player1';
    } else {
      resignation.className = 'player2';
    }
  }

  function setUpForSpectator() {
    if (black === PLAYER1) {
      stand1 = standB;
      stand2 = standA;
      clock1 = clockB;
      clock2 = clockA;
    } else {
      stand1 = standA;
      stand2 = standB;
      clock1 = clockA;
      clock2 = clockB;
    }
    stand1.className = 'stand player1';
    stand2.className = 'stand player2';
    information.textContent = 'あなたは観戦者です';
  }

  function updateInformation() {
    if (player === turn) {
      information.textContent = 'あなたの手番です';
    } else {
      information.textContent = '相手の手番です';
    }
  }

  function updateTime() {
    if (player === turn) {
      return;
    }
    if (player === PLAYER1) {
      updateTime2();
    } else {
      updateTime1();
    }
    timerID = setTimeout(updateTime, 1000);
  }

  function updateTime1() {
    time1--;
    socket.emit('update_time1', {
      time1: time1
    });
    checkTimeout(time1);
  }

  function updateTime2() {
    time2--;
    socket.emit('update_time2', {
      time2: time2
    });
    checkTimeout(time2);
  }

  function checkTimeout(time) {
    if (time === 0) {
      winner = time1 === 0 ? PLAYER2 : PLAYER1;
      socket.emit('end_of_the_game', {
        winner: winner
      });
    }
  }

  function updateClock(clock, time) {
    let m = Math.floor(time / 60);
    let s = time % 60;
    m = ('0' + m).slice(-2);
    s = ('0' + s).slice(-2);
    clock.textContent = `${m}:${s}`;
  }

  function updateGame(data) {
    clearTimeout(timerID);
    updateClock(clock1, time1);
    updateClock(clock2, time2);
    if (latest) {
      squareElements[latest].className = 'square';
    }
    latest = data.latest;
    if (latest) {
      squareElements[latest].className = 'square latest';
    }
    const latestSquareData = data.squareData;
    const latestStand1Data = data.stand1Data;
    const latestStand2Data = data.stand2Data;
    setPiece(latestSquareData);
    setPieceInHand(stand1, currentStand1Data, latestStand1Data);
    setPieceInHand(stand2, currentStand2Data, latestStand2Data);

    if (!player) {
      return;
    }
    updateInformation();
    timerID = setTimeout(updateTime, 1000);

    if (!isChecked(player === black ? 8 : 28, currentSquareData)) {
      return;
    }
    if (!isCheckmated(player === black ? 8 : 28, currentSquareData)) {
      console.log('王手です');
    } else {
      console.log('詰みです');
      winner = player === PLAYER1 ? PLAYER2 : PLAYER1;
      socket.emit('end_of_the_game', {
        winner: winner
      });
    }
  }

  function checkWaitingTime() {
    waitingTime++;
    if (waitingTime === 10) {
      winner = player === PLAYER1 ? PLAYER1 : PLAYER2;
      socket.emit('end_of_the_game', {
        winner: winner
      });
    }
    timeoutID = setTimeout(checkWaitingTime, 1000);
  }

  function checkStarted() {
    if (black) {
      return;
    }
    waitingTime++;
    console.log(waitingTime)
    if (waitingTime === 10) {
      socket.emit('abort');
    }
    timeoutID = setTimeout(checkStarted, 1000);
  }

  function initData() {
    for (let i = 0; i < 100; i++) {
      currentSquareData[i] = 0;
    }
    currentSquareData[11] = 22;
    currentSquareData[13] = 21;
    currentSquareData[17] = 1;
    currentSquareData[19] = 2;
    currentSquareData[21] = 23;
    currentSquareData[22] = 26;
    currentSquareData[23] = 21;
    currentSquareData[27] = 1;
    currentSquareData[28] = 7;
    currentSquareData[29] = 3;
    currentSquareData[31] = 24;
    currentSquareData[33] = 21;
    currentSquareData[37] = 1;
    currentSquareData[39] = 4;
    currentSquareData[41] = 25;
    currentSquareData[43] = 21;
    currentSquareData[47] = 1;
    currentSquareData[49] = 5;
    currentSquareData[51] = 28;
    currentSquareData[53] = 21;
    currentSquareData[57] = 1;
    currentSquareData[59] = 8;
    currentSquareData[61] = 25;
    currentSquareData[63] = 21;
    currentSquareData[67] = 1;
    currentSquareData[69] = 5;
    currentSquareData[71] = 24;
    currentSquareData[73] = 21;
    currentSquareData[77] = 1;
    currentSquareData[79] = 4;
    currentSquareData[81] = 23;
    currentSquareData[82] = 27;
    currentSquareData[83] = 21;
    currentSquareData[87] = 1;
    currentSquareData[88] = 6;
    currentSquareData[89] = 3;
    currentSquareData[91] = 22;
    currentSquareData[93] = 21;
    currentSquareData[97] = 1;
    currentSquareData[99] = 2;
    for (let i = 0; i < 28; i++) {
      currentStand1Data[i] = 0;
      currentStand2Data[i] = 0;
    }
  }

  function setSquare() {
    for (let i = 1; i < 10; i++) {
      for (let j = 9; j > 0; j--) {
        const square = document.createElement('div');
        const squareID = 10 * j + i;
        square.className = 'square';
        square.dataset.square = squareID;
        board.appendChild(square);
        squareElements[squareID] = square;
        setEventsOfSquare(square);
      }
    }
  }

  function setEventsOfSquare(square) {
    square.addEventListener('dragenter', (e) => {
      e.preventDefault();
    }, false);

    square.addEventListener('dragover', (e) => {
      e.preventDefault();
    }, false);

    square.addEventListener('drop', (e) => {
      e.preventDefault();
      if (winner || player !== turn || !isPlayersPiece(draggedPieceID)) {
        return;
      }
      const droppedSquare = e.currentTarget;
      const droppedSquareID = Number(droppedSquare.dataset.square);

      if (droppableRanges.indexOf(droppedSquareID) === -1) {
        return;
      }
      if (droppedSquare.firstElementChild) {
        setCapturedPiece(droppedSquare.firstElementChild);
      }
      if (draggedPiece.className === 'piece') {
        checkPromotion(droppedSquareID);
        currentSquareData[draggedSquareID] = 0;
        currentSquareData[droppedSquareID] = draggedPieceID;
      } else {
        if (player === PLAYER1) {
          currentStand1Data[draggedPieceID]--;
        } else {
          currentStand2Data[draggedPieceID]--;
        }
        currentSquareData[droppedSquareID] = draggedPieceID;
      }
      socket.emit('update_game', {
        latest: droppedSquareID,
        squareData: currentSquareData,
        stand1Data: currentStand1Data,
        stand2Data: currentStand2Data
      });
    }, false);
  }

  function isPlayersPiece(pieceID) {
    if (player === black && pieceID < 20 || player !== black && pieceID > 20) {
      return true;
    }
  }

  function setCapturedPiece(capturedPiece) {
    const capturedPieceID = getCapturedPieceID(Number(capturedPiece.dataset.piece));
    if (player === PLAYER1) {
      currentStand1Data[capturedPieceID]++;
    } else {
      currentStand2Data[capturedPieceID]++;
    }
  }

  function getCapturedPieceID(pieceID) {
    switch (pieceID) {
      case 21:
      case 31:
      return 1;

      case 22:
      case 32:
      return 2;

      case 23:
      case 33:
      return 3;

      case 24:
      case 34:
      return 4;

      case 25:
      return 5;

      case 26:
      case 36:
      return 6;

      case 27:
      case 37:
      return 7;

      case 1:
      case 11:
      return 21;

      case 2:
      case 12:
      return 22;

      case 3:
      case 13:
      return 23;

      case 4:
      case 14:
      return 24;

      case 5:
      return 25;

      case 6:
      case 16:
      return 26;

      case 7:
      case 17:
      return 27;
    }
  }

  function checkPromotion(droppedSquareID) {
    if (droppedSquareID % 10 < 4 || draggedSquareID % 10 < 4) {
      switch (draggedPieceID) {
        case 1:
        case 2:
        if (droppedSquareID % 10 === 1) {
          setPromotion();
        } else {
          choosePromotion();
        }
        return;

        case 3:
        if (droppedSquareID % 10 < 3) {
          setPromotion();
        } else {
          choosePromotion();
        }
        return;

        case 4:
        case 6:
        case 7:
        choosePromotion();
        return;
      }
    }
    if (droppedSquareID % 10 > 6 || draggedSquareID % 10 > 6) {
      switch (draggedPieceID) {
        case 21:
        case 22:
        if (droppedSquareID % 10 === 9) {
          setPromotion();
        } else {
          choosePromotion();
        }
        return;

        case 23:
        if (droppedSquareID % 10 > 7) {
          setPromotion();
        } else {
          choosePromotion();
        }
        return;

        case 24:
        case 26:
        case 27:
        choosePromotion();
        return;
      }
    }
  }

  function setPromotion() {
    draggedPieceID += 10;
  }

  function choosePromotion() {
    if (window.confirm('成りますか？')) {
      // console.log('成ります');
      setPromotion();
    } else {
      // console.log('成りません');
    }
  }

  function setPiece(latestSquareData) {
    for (let i = 11; i < 100; i++) {
      if (squareElements[i] && squareElements[i].firstElementChild) {
        squareElements[i].firstElementChild.remove();
      }
      currentSquareData[i] = latestSquareData[i];

      if (!currentSquareData[i]) {
        continue;
      }
      const piece = document.createElement('img');
      let srcID;
      if (currentSquareData[i] < 20) {
        srcID = player === black || !player ? currentSquareData[i] : currentSquareData[i] + 20;
      } else {
        srcID = player === black || !player ? currentSquareData[i] : currentSquareData[i] - 20;
      }
      piece.src = srcID + '.png';
      piece.className = 'piece';
      piece.dataset.piece = currentSquareData[i];
      squareElements[i].appendChild(piece);
      setEventsOfPiece(piece);
    }
  }

  function setPieceInHand(stand, currentStandData, latestStandData) {
    while (stand.firstElementChild) {
      stand.firstElementChild.remove();
    }
    for (let i = 27; i > 0; i--) {
      currentStandData[i] = latestStandData[i];

      if (!currentStandData[i]) {
        continue;
      }
      const pieceInHand = document.createElement('img');
      let srcID;
      if (i < 20) {
        srcID = player === black || !player ? i : i + 20;
      } else {
        srcID = player === black || !player ? i : i - 20;
      }
      pieceInHand.src = srcID + '.png';
      pieceInHand.className = 'piece-in-hand';
      pieceInHand.dataset.piece = i;
      stand.appendChild(pieceInHand);
      setEventsOfPiece(pieceInHand);
      const count = document.createElement('div');
      count.className = currentStandData[i] === 1 ? 'count hidden' : 'count';
      count.textContent = currentStandData[i];
      stand.appendChild(count);
    }
  }

  function setEventsOfPiece(piece) {
    piece.addEventListener('dragstart', (e) => {
      draggedPiece = e.currentTarget;
      draggedPieceID = Number(draggedPiece.dataset.piece);
      draggedSquareID = Number(draggedPiece.parentNode.dataset.square);

      if (winner || player !== turn || !isPlayersPiece(draggedPieceID)) {
        return;
      }
      draggedPiece.style.opacity = '0.5';
      let movements;
      if (draggedPiece.className === 'piece') {
        movements = getMovementsOfPiece(draggedPieceID, draggedSquareID, currentSquareData);
      } else {
        movements = getMovementsOfPieceInHand(draggedPieceID, currentSquareData);
      }
      droppableRanges = getLegalMovements(draggedPieceID, draggedSquareID, currentSquareData, movements);
      for (const squareID of droppableRanges) {
        squareElements[squareID].classList.add('droppable');
      }
    }, false);

    piece.addEventListener('dragend', () => {
      draggedPiece.style.opacity = '1';
      for (const squareID of droppableRanges) {
        squareElements[squareID].classList.remove('droppable');
      }
    }, false);
  }

  function getMovementsOfPiece(pieceID, squareID, squareData) {
    let results = [];
    switch (pieceID) {
      case 1:
      case 21:
      setOne(pieceID, squareID, squareData, results, 1);
      return results;

      case 2:
      case 22:
      setLine(pieceID, squareID, squareData, results, 1);
      return results;

      case 3:
      case 23:
      setOne(pieceID, squareID, squareData, results, -8);
      setOne(pieceID, squareID, squareData, results, 12);
      return results;

      case 4:
      case 24:
      setOne(pieceID, squareID, squareData, results, -9);
      setOne(pieceID, squareID, squareData, results, 1);
      setOne(pieceID, squareID, squareData, results, 11);
      setOne(pieceID, squareID, squareData, results, -11);
      setOne(pieceID, squareID, squareData, results, 9);
      return results;

      case 5:
      case 11:
      case 12:
      case 13:
      case 14:
      case 25:
      case 31:
      case 32:
      case 33:
      case 34:
      setOne(pieceID, squareID, squareData, results, -9);
      setOne(pieceID, squareID, squareData, results, 1);
      setOne(pieceID, squareID, squareData, results, 11);
      setOne(pieceID, squareID, squareData, results, -10);
      setOne(pieceID, squareID, squareData, results, 10);
      setOne(pieceID, squareID, squareData, results, -1);
      return results;

      case 6:
      case 26:
      setLine(pieceID, squareID, squareData, results, -9);
      setLine(pieceID, squareID, squareData, results, 11);
      setLine(pieceID, squareID, squareData, results, -11);
      setLine(pieceID, squareID, squareData, results, 9);
      return results;

      case 7:
      case 27:
      setLine(pieceID, squareID, squareData, results, 1);
      setLine(pieceID, squareID, squareData, results, -10);
      setLine(pieceID, squareID, squareData, results, 10);
      setLine(pieceID, squareID, squareData, results, -1);
      return results;

      case 8:
      case 28:
      setOne(pieceID, squareID, squareData, results, -9);
      setOne(pieceID, squareID, squareData, results, 1);
      setOne(pieceID, squareID, squareData, results, 11);
      setOne(pieceID, squareID, squareData, results, -10);
      setOne(pieceID, squareID, squareData, results, 10);
      setOne(pieceID, squareID, squareData, results, -11);
      setOne(pieceID, squareID, squareData, results, -1);
      setOne(pieceID, squareID, squareData, results, 9);
      return results;

      case 16:
      case 36:
      setLine(pieceID, squareID, squareData, results, -9);
      setLine(pieceID, squareID, squareData, results, 11);
      setLine(pieceID, squareID, squareData, results, -11);
      setLine(pieceID, squareID, squareData, results, 9);
      setOne(pieceID, squareID, squareData, results, 1);
      setOne(pieceID, squareID, squareData, results, -10);
      setOne(pieceID, squareID, squareData, results, 10);
      setOne(pieceID, squareID, squareData, results, -1);
      return results;

      case 17:
      case 37:
      setLine(pieceID, squareID, squareData, results, 1);
      setLine(pieceID, squareID, squareData, results, -10);
      setLine(pieceID, squareID, squareData, results, 10);
      setLine(pieceID, squareID, squareData, results, -1);
      setOne(pieceID, squareID, squareData, results, -9);
      setOne(pieceID, squareID, squareData, results, 11);
      setOne(pieceID, squareID, squareData, results, -11);
      setOne(pieceID, squareID, squareData, results, 9);
      return results;
    }
  }

  function setOne(pieceID, squareID, squareData, results, diff) {
    const sign = pieceID < 20 ? 1 : -1;
    squareID = squareID - (diff * sign);
    if (squareElements[squareID]) {
      if (squareData[squareID]) {
        if (isFriendlyPiece(pieceID, squareID, squareData)) {
          return;
        }
      }
      results.push(squareID);
    }
  }

  function setLine(pieceID, squareID, squareData, results, diff) {
    const sign = pieceID < 20 ? 1 : -1;
    squareID = squareID - (diff * sign);
    while (squareElements[squareID]) {
      if (squareData[squareID]) {
        if (isFriendlyPiece(pieceID, squareID, squareData)) {
          return;
        } else {
          results.push(squareID);
          return;
        }
      }
      results.push(squareID);
      squareID = squareID - (diff * sign);
    }
  }

  function isFriendlyPiece(pieceID, squareID, squareData) {
    const targetPieceID = squareData[squareID];
    if (targetPieceID < 20 && pieceID < 20 || targetPieceID > 20 && pieceID > 20) {
      return true;
    }
  }

  function getMovementsOfPieceInHand(pieceID, squareData) {
    let results = [];
    for (let i = 11; i < 100; i++) {
      if (squareElements[i] && !squareData[i] && isLegalMovement(pieceID, i, squareData)) {
        results.push(i);
      }
    }
    return results;
  }

  function isLegalMovement(pieceID, squareID, squareData) {
    switch (pieceID) {
      case 1:
      if (squareID % 10 > 1 && !isTwoPawns(pieceID, squareID, squareData) && !isDropPawnMate(pieceID, squareID, squareData)) {
        return true;
      }
      return;

      case 2:
      if (squareID % 10 > 1) {
        return true;
      }
      return;

      case 3:
      if (squareID % 10 > 2) {
        return true;
      }
      return;

      case 21:
      if (squareID % 10 < 9 && !isTwoPawns(pieceID, squareID, squareData) && !isDropPawnMate(pieceID, squareID, squareData)) {
        return true;
      }
      return;

      case 22:
      if (squareID % 10 < 9) {
        return true;
      }
      return;

      case 23:
      if (squareID % 10 < 8) {
        return true;
      }
      return;

      default:
      return true;
    }
  }

  function isTwoPawns(pieceID, squareID, squareData) {
    const file = Math.floor(squareID / 10);
    for (let i = file * 10 + 1; i < file * 10 + 10; i++) {
      if (squareData[i] === pieceID) {
        return true;
      }
    }
  }

  function isDropPawnMate(pieceID, squareID, squareData) {
    const targetPieceID = pieceID < 20 ? 28 : 8;
    const targetSquareID = pieceID < 20 ? squareID - 1 : squareID + 1;

    if (squareData[targetSquareID] !== targetPieceID) {
      return;
    }
    const tmpSquareData = squareData.concat();
    tmpSquareData[squareID] = pieceID;
    if (isCheckmated(targetPieceID, tmpSquareData)) {
      return true;
    }
  }

  function getLegalMovements(pieceID, squareID, squareData, movements) {
    let results = [];
    for (let i = 0; i < movements.length; i++) {
      const tmpSquareData = squareData.concat();
      tmpSquareData[squareID] = 0;
      tmpSquareData[movements[i]] = pieceID;
      if (!isChecked(pieceID, tmpSquareData)) {
        results.push(movements[i]);
      }
    }
    return results;
  }

  function isChecked(pieceID, squareData) {
    const targetPieceID = pieceID < 20 ? 8 : 28;
    const enemyMovements = getEnemyMovements(pieceID, squareData);
    for (const squareID of enemyMovements) {
      if (squareData[squareID] === targetPieceID) {
        return true;
      }
    }
  }

  function getEnemyMovements(pieceID, squareData) {
    let results = [];
    for (let i = 11; i < 100; i++) {
      if (squareData[i] && !isFriendlyPiece(pieceID, i, squareData)) {
        const movements = getMovementsOfPiece(squareData[i], i, squareData);
        results = results.concat(movements);
      }
    }
    return results;
  }

  function isCheckmated(pieceID, squareData) {
    if (canMovePiece(pieceID, squareData)) {
      return;
    }
    if (!canDropPieceInHand(pieceID, squareData)) {
      return true;
    }
  }

  function canMovePiece(pieceID, squareData) {
    for (let i = 11; i < 100; i++) {
      if (!squareData[i] || !isFriendlyPiece(pieceID, i, squareData)) {
        continue;
      }
      const movements = getMovementsOfPiece(squareData[i], i, squareData);
      const legalMovements = getLegalMovements(squareData[i], i, squareData, movements);
      if (legalMovements.length) {
        return true;
      }
    }
  }

  function canDropPieceInHand(pieceID, squareData) {
    let standData;
    if (pieceID < 20) {
      standData = black === PLAYER1 ? currentStand1Data : currentStand2Data;
    } else {
      standData = black === PLAYER1 ? currentStand2Data : currentStand1Data;
    }
    for (let i = 0; i < 28; i++) {
      if (!standData[i]) {
        continue;
      }
      const movements = getMovementsOfPieceInHand(i, squareData);
      const legalMovements = getLegalMovements(i, 0, squareData, movements);
      if (legalMovements.length) {
        return true;
      }
    }
  }

})();
