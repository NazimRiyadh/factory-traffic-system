const { SignalTransition, TRANSITION_STEPS } = require('../../domain/SignalTransition');
const config = require('../../config');

describe('SignalTransition', () => {
  test('returns NONE step when targetPhase is equal to currentPhase', () => {
    const steps = SignalTransition.calculateTransition('NORTH_SOUTH', 'NORTH_SOUTH', config);
    expect(steps).toHaveLength(1);
    expect(steps[0].step).toBe(TRANSITION_STEPS.NONE);
  });

  test('generates safe three-step sequence: YELLOW -> ALL_RED -> GREEN', () => {
    const steps = SignalTransition.calculateTransition('NORTH_SOUTH', 'EAST_WEST', config);

    expect(steps).toHaveLength(3);
    expect(steps[0].step).toBe(TRANSITION_STEPS.YELLOW);
    expect(steps[0].signals.NORTH).toBe('YELLOW');
    expect(steps[0].signals.SOUTH).toBe('YELLOW');
    expect(steps[0].signals.EAST).toBe('RED');
    expect(steps[0].signals.WEST).toBe('RED');

    expect(steps[1].step).toBe(TRANSITION_STEPS.ALL_RED);
    expect(steps[1].signals.NORTH).toBe('RED');
    expect(steps[1].signals.SOUTH).toBe('RED');
    expect(steps[1].signals.EAST).toBe('RED');
    expect(steps[1].signals.WEST).toBe('RED');

    expect(steps[2].step).toBe(TRANSITION_STEPS.GREEN);
    expect(steps[2].signals.NORTH).toBe('RED');
    expect(steps[2].signals.SOUTH).toBe('RED');
    expect(steps[2].signals.EAST).toBe('GREEN');
    expect(steps[2].signals.WEST).toBe('GREEN');
  });

  test('every step in transition is safe against conflicting greens', () => {
    const steps = SignalTransition.calculateTransition('NORTH_SOUTH', 'EAST_WEST', config);
    for (const step of steps) {
      if (step.signals) {
        expect(SignalTransition.isTransitionSafe(null, step.signals)).toBe(true);
      }
    }
  });
});
