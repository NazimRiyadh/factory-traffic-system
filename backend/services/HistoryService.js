/**
 * HistoryService — Audit trail management.
 */

class HistoryService {
  constructor(historyRepo) {
    this.historyRepo = historyRepo;
  }

  log(junctionId, eventType, direction = null, details = null) {
    return this.historyRepo.log(junctionId, eventType, direction, details);
  }

  getByJunction(junctionId, limit = 100) {
    return this.historyRepo.findByJunctionId(junctionId, limit);
  }

  getAll(limit = 100) {
    return this.historyRepo.findAll(limit);
  }
}

module.exports = HistoryService;
