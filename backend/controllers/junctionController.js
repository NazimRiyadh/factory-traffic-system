/**
 * JunctionController — Route handlers for junction state and queries.
 */

class JunctionController {
  constructor(junctionService, controllerService) {
    this.junctionService = junctionService;
    this.controllerService = controllerService;
  }

  getAll = (req, res, next) => {
    try {
      const junctions = this.junctionService.getAll();
      res.json(junctions);
    } catch (err) {
      next(err);
    }
  };

  getById = (req, res, next) => {
    try {
      const { id } = req.params;
      const junction = this.junctionService.getById(id);
      if (!junction) {
        return res.status(404).json({ error: 'NotFound', message: `Junction '${id}' not found` });
      }
      res.json(junction);
    } catch (err) {
      next(err);
    }
  };

  getStatus = (req, res, next) => {
    try {
      const { id } = req.params;
      const status = this.junctionService.getStatus(id);
      if (!status) {
        return res.status(404).json({ error: 'NotFound', message: `Junction '${id}' not found` });
      }
      res.json(status);
    } catch (err) {
      next(err);
    }
  };

  create = (req, res, next) => {
    try {
      const { id, name } = req.body;
      if (!id || !name) {
        return res.status(400).json({ error: 'ValidationError', message: 'id and name are required' });
      }
      const junction = this.junctionService.create(req.body);
      res.status(201).json(junction);
    } catch (err) {
      next(err);
    }
  };

  simulateAck = (req, res, next) => {
    try {
      const { id } = req.params;
      const ackCount = this.controllerService.simulateAcknowledgeAll(id);
      res.json({
        message: `Successfully simulated ACKs for junction ${id}`,
        acknowledgedCount: ackCount
      });
    } catch (err) {
      next(err);
    }
  };
}

export default JunctionController;
