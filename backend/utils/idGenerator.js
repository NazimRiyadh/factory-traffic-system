const { v4: uuidv4 } = require('uuid');

function generateCommandId() {
  return `cmd_${uuidv4()}`;
}

function generateEventId() {
  return `evt_${uuidv4()}`;
}

module.exports = {
  generateCommandId,
  generateEventId,
};
