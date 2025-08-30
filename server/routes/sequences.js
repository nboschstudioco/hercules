const express = require('express');
const database = require('../database');
const router = express.Router();

// Import auth middleware
const { authenticateToken } = require('./auth');

/**
 * Get all sequences for user
 * GET /sequences
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        
        const sequences = await database.getSequencesByUser(userId);
        
        // Parse JSON fields and format response
        const processedSequences = sequences.map(sequence => ({
            id: sequence.id,
            name: sequence.name,
            description: sequence.description,
            steps: JSON.parse(sequence.steps || '[]'),
            isActive: sequence.is_active,
            createdAt: sequence.created_at,
            updatedAt: sequence.updated_at
        }));
        
        res.json({
            success: true,
            sequences: processedSequences
        });
        
    } catch (error) {
        console.error('Get sequences error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sequences'
        });
    }
});

/**
 * Create new sequence
 * POST /sequences
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { name, description, steps, isActive } = req.body;
        
        // Validate required fields
        if (!name || !steps || !Array.isArray(steps)) {
            return res.status(400).json({
                success: false,
                error: 'Name and steps array are required'
            });
        }
        
        // Validate steps format
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (!step.subject || !step.body || typeof step.delayDays !== 'number') {
                return res.status(400).json({
                    success: false,
                    error: `Step ${i + 1} must have subject, body, and delayDays`
                });
            }
        }
        
        const sequenceId = await database.createSequence({
            userId,
            name,
            description: description || '',
            steps,
            isActive: isActive !== false
        });
        
        // Get the created sequence
        const sequence = await database.getSequenceById(sequenceId);
        
        res.status(201).json({
            success: true,
            sequence: {
                id: sequence.id,
                name: sequence.name,
                description: sequence.description,
                steps: JSON.parse(sequence.steps),
                isActive: sequence.is_active,
                createdAt: sequence.created_at,
                updatedAt: sequence.updated_at
            }
        });
        
    } catch (error) {
        console.error('Create sequence error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create sequence'
        });
    }
});

/**
 * Get specific sequence by ID
 * GET /sequences/{sequenceId}
 */
router.get('/:sequenceId', authenticateToken, async (req, res) => {
    try {
        const { sequenceId } = req.params;
        const { userId } = req.user;
        
        const sequence = await database.getSequenceById(sequenceId);
        
        if (!sequence) {
            return res.status(404).json({
                success: false,
                error: 'Sequence not found'
            });
        }
        
        // Verify user owns this sequence
        if (sequence.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        res.json({
            success: true,
            sequence: {
                id: sequence.id,
                name: sequence.name,
                description: sequence.description,
                steps: JSON.parse(sequence.steps),
                isActive: sequence.is_active,
                createdAt: sequence.created_at,
                updatedAt: sequence.updated_at
            }
        });
        
    } catch (error) {
        console.error('Get sequence by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sequence'
        });
    }
});

/**
 * Update sequence
 * PUT /sequences/{sequenceId}
 */
router.put('/:sequenceId', authenticateToken, async (req, res) => {
    try {
        const { sequenceId } = req.params;
        const { userId } = req.user;
        const { name, description, steps, isActive } = req.body;
        
        // Check if sequence exists and belongs to user
        const sequence = await database.getSequenceById(sequenceId);
        
        if (!sequence) {
            return res.status(404).json({
                success: false,
                error: 'Sequence not found'
            });
        }
        
        if (sequence.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        // Validate steps if provided
        if (steps && Array.isArray(steps)) {
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                if (!step.subject || !step.body || typeof step.delayDays !== 'number') {
                    return res.status(400).json({
                        success: false,
                        error: `Step ${i + 1} must have subject, body, and delayDays`
                    });
                }
            }
        }
        
        // Update sequence
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (steps !== undefined) updateData.steps = steps;
        if (isActive !== undefined) updateData.isActive = isActive;
        
        await database.updateSequence(sequenceId, updateData);
        
        // Get updated sequence
        const updatedSequence = await database.getSequenceById(sequenceId);
        
        res.json({
            success: true,
            sequence: {
                id: updatedSequence.id,
                name: updatedSequence.name,
                description: updatedSequence.description,
                steps: JSON.parse(updatedSequence.steps),
                isActive: updatedSequence.is_active,
                createdAt: updatedSequence.created_at,
                updatedAt: updatedSequence.updated_at
            }
        });
        
    } catch (error) {
        console.error('Update sequence error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update sequence'
        });
    }
});

/**
 * Delete sequence
 * DELETE /sequences/{sequenceId}
 */
router.delete('/:sequenceId', authenticateToken, async (req, res) => {
    try {
        const { sequenceId } = req.params;
        const { userId } = req.user;
        
        // Check if sequence exists and belongs to user
        const sequence = await database.getSequenceById(sequenceId);
        
        if (!sequence) {
            return res.status(404).json({
                success: false,
                error: 'Sequence not found'
            });
        }
        
        if (sequence.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        // Check if sequence has active enrollments
        const activeEnrollments = await database.all(
            'SELECT id FROM enrollments WHERE sequence_id = ? AND status = ?',
            [sequenceId, 'active']
        );
        
        if (activeEnrollments.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete sequence with active enrollments'
            });
        }
        
        // Delete sequence
        await database.deleteSequence(sequenceId);
        
        res.json({
            success: true,
            message: 'Sequence deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete sequence error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete sequence'
        });
    }
});

module.exports = router;