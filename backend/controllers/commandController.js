/**
 * CommandController — Manual operator control endpoints.
 */

class CommandController {
  constructor(commandService) {
    this.commandService = commandService;
  }

  processCommand = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await this.commandService.processCommand(id, req.body);
      res.status(result.statusCode || 200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export default CommandController;
