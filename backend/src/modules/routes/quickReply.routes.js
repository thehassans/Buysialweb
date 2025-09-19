import express from 'express';
import { getQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply } from '../controllers/quickReply.controller.js';
import { auth, allowRoles } from '../middleware/auth.js';

const router = express.Router();

// All routes in this file are protected and for agents only
router.use(auth, allowRoles('agent'));

router.route('/')
  .get(getQuickReplies)
  .post(createQuickReply);

router.route('/:id')
  .patch(updateQuickReply)
  .delete(deleteQuickReply);

export { router };
