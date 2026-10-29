/**
 * ControllerEventController — Hardware controller callback endpoint.
 */

class ControllerEventController {
  constructor(controllerService) {
    this.controllerService = controllerService;
  }

  processEvent = async (req, res, next) => {
    try {
      const result = await this.controllerService.processControllerEvent(req.body);
      res.status(result.statusCode || 200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export default ControllerEventController;
