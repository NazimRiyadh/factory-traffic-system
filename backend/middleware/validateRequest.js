/**
 * Request validation helpers.
 */

export function validateSensorEventBody(req, res, next) {
  const { event_id, junction_id, direction, event_type, vehicle_id } = req.body || {};

  if (!event_id) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field: event_id' });
  }
  if (!junction_id) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field: junction_id' });
  }
  if (!direction) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field: direction' });
  }
  if (!['NORTH', 'SOUTH', 'EAST', 'WEST'].includes(direction)) {
    return res.status(400).json({ error: 'ValidationError', message: 'Invalid direction. Must be NORTH, SOUTH, EAST, or WEST' });
  }
  if (!event_type) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field: event_type' });
  }
  if (!['VEHICLE_ARRIVED', 'VEHICLE_CLEARED'].includes(event_type)) {
    return res.status(400).json({ error: 'ValidationError', message: 'Invalid event_type. Must be VEHICLE_ARRIVED or VEHICLE_CLEARED' });
  }
  if (!vehicle_id) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field: vehicle_id' });
  }

  next();
}

export function validateCommandBody(req, res, next) {
  const { command } = req.body || {};

  if (!command) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field: command' });
  }
  if (!['MANUAL_GREEN_REQUEST', 'RETURN_TO_AUTOMATIC'].includes(command)) {
    return res.status(400).json({ error: 'ValidationError', message: 'Invalid command. Must be MANUAL_GREEN_REQUEST or RETURN_TO_AUTOMATIC' });
  }
  if (command === 'MANUAL_GREEN_REQUEST' && !req.body.direction) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field for MANUAL_GREEN_REQUEST: direction' });
  }

  next();
}

export function validateControllerEventBody(req, res, next) {
  const { junction_id, status, command_id, actual_state, direction } = req.body || {};

  if (!junction_id) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field: junction_id' });
  }
  if (!status) {
    return res.status(400).json({ error: 'ValidationError', message: 'Missing required field: status' });
  }
  if (!['ACK', 'NACK', 'OFFLINE', 'ONLINE', 'FAILED'].includes(status)) {
    return res.status(400).json({ error: 'ValidationError', message: 'Invalid status. Must be ACK, NACK, OFFLINE, ONLINE, or FAILED' });
  }
  if (status === 'ACK') {
    if (!command_id) {
      return res.status(400).json({ error: 'ValidationError', message: 'Missing required field for ACK: command_id' });
    }
    if (!actual_state) {
      return res.status(400).json({ error: 'ValidationError', message: 'Missing required field for ACK: actual_state' });
    }
    if (!['RED', 'YELLOW', 'GREEN'].includes(actual_state)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid actual_state for ACK. Must be RED, YELLOW, or GREEN' });
    }
    if (!direction) {
      return res.status(400).json({ error: 'ValidationError', message: 'Missing required field for ACK: direction' });
    }
    if (!['NORTH', 'SOUTH', 'EAST', 'WEST'].includes(direction)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid direction for ACK. Must be NORTH, SOUTH, EAST, or WEST' });
    }
  }

  next();
}

export default {
  validateSensorEventBody,
  validateCommandBody,
  validateControllerEventBody,
};
