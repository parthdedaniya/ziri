// Policy routes - manage Cedar policies (local mode)

import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { serviceFactory } from '../services/service-factory.js'

const router: Router = Router()

/**
 * GET /api/policies
 * Get all policies
 */
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const policyStore = serviceFactory.getPolicyStore()
    const policies = await policyStore.getPolicies()
    
    res.json({
      data: {
        policies
      }
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get policies',
      message: error.message
    })
  }
})

/**
 * POST /api/policies
 * Create a new policy
 */
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { policy, description } = req.body
    
    if (!policy || !description) {
      res.status(400).json({
        error: 'Policy and description are required'
      })
      return
    }
    
    const policyStore = serviceFactory.getPolicyStore()
    await policyStore.createPolicy(policy, description)
    
    res.json({
      success: true,
      message: 'Policy created successfully'
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to create policy',
      message: error.message
    })
  }
})

/**
 * PUT /api/policies
 * Update a policy
 */
router.put('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { oldPolicy, policy, description } = req.body
    
    if (!oldPolicy || !policy || !description) {
      res.status(400).json({
        error: 'oldPolicy, policy, and description are required'
      })
      return
    }
    
    const policyStore = serviceFactory.getPolicyStore()
    await policyStore.updatePolicy(oldPolicy, policy, description)
    
    res.json({
      success: true,
      message: 'Policy updated successfully'
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to update policy',
      message: error.message
    })
  }
})

/**
 * DELETE /api/policies
 * Delete a policy
 */
router.delete('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { policy } = req.body
    
    if (!policy) {
      res.status(400).json({
        error: 'Policy is required'
      })
      return
    }
    
    const policyStore = serviceFactory.getPolicyStore()
    await policyStore.deletePolicy(policy)
    
    res.json({
      success: true,
      message: 'Policy deleted successfully'
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to delete policy',
      message: error.message
    })
  }
})

export default router
