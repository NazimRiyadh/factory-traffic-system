/**
 * HistoryController — Audit log queries.
 */

class HistoryController {
  constructor(historyService) {
    this.historyService = historyService;
  }

  getByJunction = (req, res, next) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit, 10) || 100;
      const history = this.historyService.getByJunction(id, limit);
      res.json(history);
    } catch (err) {
      next(err);
    }
  };

  getAll = (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const history = this.historyService.getAll(limit);
      res.json(history);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = HistoryController;
