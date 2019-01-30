(() => {

  'use strict';

  const socket = io();

  const ROOM_COUNT = 6;

  const icons = document.getElementsByClassName('fas');

  const iconList = [];
  for (let i = 1; i < ROOM_COUNT + 1; i++) {
    iconList[i] = [];
  }

  for (let i = 0; i < ROOM_COUNT * 2; i++) {
    const roomNum = Math.floor(i / 2) + 1;
    const playerNum = i % 2 + 1;
    iconList[roomNum][playerNum] = icons[i];
  }

  socket.emit('enter_lobby');

  socket.on('registered', (roomNum, playerNum) => {
    iconList[roomNum][playerNum].classList.remove('hidden');
  });

  socket.on('deregistered', (roomNum, playerNum) => {
    iconList[roomNum][playerNum].classList.add('hidden');
  });

})();
