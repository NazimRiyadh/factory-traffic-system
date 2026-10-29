/**
 * SensorEventController — Ingestion of vehicle arrival and clearance sensor events.
 */

class SensorEventController {
  constructor(eventService) {
    this.eventService = eventService;
  }

  processEvent = async (req, res, next) => {
    try {
      const result = await this.eventService.processEvent(req.body);
      res.status(result.statusCode || 200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export default SensorEventController;
