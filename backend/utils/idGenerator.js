import { v4 as uuidv4 } from 'uuid';

export function generateCommandId() {
  return `cmd_${uuidv4()}`;
}

export function generateEventId() {
  return `evt_${uuidv4()}`;
}

export default {
  generateCommandId,
  generateEventId,
};
