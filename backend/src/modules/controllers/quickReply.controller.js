import QuickReply from '../models/quickReply.model.js';

// @desc    Get all quick replies for the logged-in agent
// @route   GET /api/quick-replies
// @access  Private (Agent)
export const getQuickReplies = async (req, res) => {
  try {
    const replies = await QuickReply.find({ agent: req.user.id }).sort({ shortcut: 1 });
    res.json({ replies });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a new quick reply
// @route   POST /api/quick-replies
// @access  Private (Agent)
export const createQuickReply = async (req, res) => {
  const { shortcut, message } = req.body;
  if (!shortcut || !message) {
    return res.status(400).json({ message: 'Shortcut and message are required' });
  }

  try {
    const newReply = new QuickReply({
      shortcut,
      message,
      agent: req.user.id,
    });

    const savedReply = await newReply.save();
    res.status(201).json(savedReply);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Shortcut already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update a quick reply
// @route   PATCH /api/quick-replies/:id
// @access  Private (Agent)
export const updateQuickReply = async (req, res) => {
  const { shortcut, message } = req.body;
  try {
    const reply = await QuickReply.findById(req.params.id);

    if (!reply) {
      return res.status(404).json({ message: 'Quick reply not found' });
    }

    // Ensure the agent owns the reply
    if (reply.agent.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    reply.shortcut = shortcut || reply.shortcut;
    reply.message = message || reply.message;

    const updatedReply = await reply.save();
    res.json(updatedReply);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Shortcut already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete a quick reply
// @route   DELETE /api/quick-replies/:id
// @access  Private (Agent)
export const deleteQuickReply = async (req, res) => {
  try {
    const reply = await QuickReply.findById(req.params.id);

    if (!reply) {
      return res.status(404).json({ message: 'Quick reply not found' });
    }

    if (reply.agent.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await reply.remove();
    res.json({ message: 'Quick reply removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export { getQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply };
