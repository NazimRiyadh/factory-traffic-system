/**
 * ControllerEventController — Hardware controller callback endpoint.
 */

class ControllerEventController {
  constructor(controllerService) {
    this.controllerService = controllerService;
  }

  processEvent = (req, res, next) => {
    try {
      const result = this.controllerService.processControllerEvent(req.body);
      res.status(result.statusCode || 200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = ControllerEventController;
