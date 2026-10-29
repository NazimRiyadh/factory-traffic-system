import SignalPhase from '../../domain/SignalPhase.js';
import { SIGNAL_STATES } from '../../domain/constants.js';

describe('SignalPhase', () => {
  test('getPhaseForDirection returns correct phase', () => {
    expect(SignalPhase.getPhaseForDirection('NORTH')).toBe('NORTH_SOUTH');
    expect(SignalPhase.getPhaseForDirection('SOUTH')).toBe('NORTH_SOUTH');
    expect(SignalPhase.getPhaseForDirection('EAST')).toBe('EAST_WEST');
    expect(SignalPhase.getPhaseForDirection('WEST')).toBe('EAST_WEST');
  });

  test('areConflicting returns true for different phases and false for identical phases', () => {
    expect(SignalPhase.areConflicting('NORTH_SOUTH', 'EAST_WEST')).toBe(true);
    expect(SignalPhase.areConflicting('NORTH_SOUTH', 'NORTH_SOUTH')).toBe(false);
  });

  test('getSignalStatesForPhase correctly sets green on phase directions and red on others', () => {
    const nsSignals = SignalPhase.getSignalStatesForPhase('NORTH_SOUTH');
    expect(nsSignals.NORTH).toBe(SIGNAL_STATES.GREEN);
    expect(nsSignals.SOUTH).toBe(SIGNAL_STATES.GREEN);
    expect(nsSignals.EAST).toBe(SIGNAL_STATES.RED);
    expect(nsSignals.WEST).toBe(SIGNAL_STATES.RED);

    const ewSignals = SignalPhase.getSignalStatesForPhase('EAST_WEST');
    expect(ewSignals.NORTH).toBe(SIGNAL_STATES.RED);
    expect(ewSignals.SOUTH).toBe(SIGNAL_STATES.RED);
    expect(ewSignals.EAST).toBe(SIGNAL_STATES.GREEN);
    expect(ewSignals.WEST).toBe(SIGNAL_STATES.GREEN);
  });

  test('validateSafety correctly flags conflicting GREEN signals', () => {
    const safeNS = { NORTH: 'GREEN', SOUTH: 'GREEN', EAST: 'RED', WEST: 'RED' };
    expect(SignalPhase.validateSafety(safeNS)).toBe(true);

    const safeAllRed = { NORTH: 'RED', SOUTH: 'RED', EAST: 'RED', WEST: 'RED' };
    expect(SignalPhase.validateSafety(safeAllRed)).toBe(true);

    const unsafeSignals = { NORTH: 'GREEN', SOUTH: 'RED', EAST: 'GREEN', WEST: 'RED' };
    expect(SignalPhase.validateSafety(unsafeSignals)).toBe(false);
  });
});
