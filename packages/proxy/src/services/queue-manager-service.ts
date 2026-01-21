// Queue manager service using better-queue with SQLite store

import Queue from 'better-queue'
import SQLiteStore from 'better-queue-sqlite'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db/index.js'

interface QueuedRequestData {
  requestId: string
  userKeyId: string
  authId: string
  apiKeyId: string
  provider: string
  model: string
  requestBody: any
  estimatedCost: number
}

interface QueueConfig {
  maxConcurrentPerUser: number
  maxQueuePerUser: number
  requestTimeoutMs: number
}

/**
 * Queue manager service using better-queue with SQLite store
 * Provides per-user concurrent request limiting and persistent queueing
 */
export class QueueManagerService {
  // Per-user queues: userKeyId -> Queue instance
  private userQueues: Map<string, Queue<QueuedRequestData>> = new Map()
  
  // Track active requests per user
  private activeRequests: Map<string, Set<string>> = new Map() // userKeyId -> Set<requestId>
  
  // Track queued requests per user (since better-queue doesn't expose getLength)
  private queuedRequests: Map<string, Set<string>> = new Map() // userKeyId -> Set<requestId>
  
  private db: Database.Database
  private readonly config: QueueConfig = {
    maxConcurrentPerUser: 5,
    maxQueuePerUser: 10,
    requestTimeoutMs: 120000, // 2 minutes
  }

  constructor(db?: Database.Database, config?: Partial<QueueConfig>) {
    this.db = db || getDatabase()
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  /**
   * Get or create queue for a user
   * Note: better-queue processes jobs automatically, so we use a simpler approach
   * We'll track concurrency manually and use the queue for persistence
   */
  private getUserQueue(userKeyId: string): Queue<QueuedRequestData> {
    if (!this.userQueues.has(userKeyId)) {
      // Get database path
      const dbPath = this.db.name
      
      // Create SQLite store for this user's queue
      const store = new SQLiteStore({
        path: dbPath,
        tableName: `queue_${userKeyId.replace(/[^a-zA-Z0-9]/g, '_')}`, // Sanitize userKeyId
      })

      // Create queue with processor
      // Note: better-queue will call the processor when a job is ready
      const queue = new Queue<QueuedRequestData>(
        async (input: QueuedRequestData, cb: (error: Error | null, result?: QueuedRequestData) => void) => {
          // This processor is called by better-queue when job is ready
          // Mark as active and remove from queued
          this.markJobActive(userKeyId, input.requestId)
          this.markJobDequeued(userKeyId, input.requestId)
          
          // The actual request processing happens in the route handler
          // We just use this to track that a slot is available
          cb(null, input)
        },
        {
          store,
          concurrent: this.config.maxConcurrentPerUser,
          maxRetries: 0,
          retryDelay: 0,
          batchSize: 1,
          batchDelay: 0,
        }
      )

      // Track queue events
      queue.on('task_finish', (id: string) => {
        this.markJobCompleted(userKeyId, id)
        this.markJobDequeued(userKeyId, id)
      })

      queue.on('task_failed', (id: string) => {
        this.markJobCompleted(userKeyId, id)
        this.markJobDequeued(userKeyId, id)
      })
      
      // Track when tasks are queued (when push callback is called)
      // Note: We'll track this in acquireSlot when we push

      this.userQueues.set(userKeyId, queue)
    }
    
    return this.userQueues.get(userKeyId)!
  }

  /**
   * Check if request can proceed (not at capacity)
   * Returns true if slot available, false if should queue
   */
  async canProceed(userKeyId: string): Promise<boolean> {
    const queueLength = await this.getQueueLength(userKeyId)
    const activeCount = this.getActiveCount(userKeyId)
    
    return activeCount < this.config.maxConcurrentPerUser
  }

  /**
   * Acquire a slot for processing (will queue if at capacity)
   * @returns Promise that resolves when slot is available
   */
  async acquireSlot(
    userKeyId: string,
    requestId: string,
    jobData: QueuedRequestData
  ): Promise<void> {
    const queue = this.getUserQueue(userKeyId)
    
    // Check queue size before adding
    const queueLength = await this.getQueueLength(userKeyId)
    const activeCount = this.getActiveCount(userKeyId)
    
    if (activeCount >= this.config.maxConcurrentPerUser && 
        queueLength >= this.config.maxQueuePerUser) {
      throw new Error(
        `Queue full for user. Active: ${activeCount}, Queued: ${queueLength}`
      )
    }

    // If at capacity, push to queue (will be processed when slot available)
    if (activeCount >= this.config.maxConcurrentPerUser) {
      // Mark as queued before pushing
      this.markJobQueued(userKeyId, requestId)
      
      return new Promise<void>((resolve, reject) => {
        queue.push(jobData, (err: Error | null) => {
          if (err) {
            // Remove from queued if push failed
            this.markJobDequeued(userKeyId, requestId)
            reject(err)
          } else {
            // Job will be processed by queue processor
            // When processor runs, it will mark as active and dequeued
            // We resolve here to indicate slot acquired (queued)
            resolve()
          }
        })
      })
    }

    // Slot available immediately
    this.markJobActive(userKeyId, requestId)
  }

  /**
   * Release slot after request completes
   */
  releaseSlot(userKeyId: string, requestId: string): void {
    this.markJobCompleted(userKeyId, requestId)
  }

  /**
   * Get active request count for a user
   */
  getActiveCount(userKeyId: string): number {
    return this.activeRequests.get(userKeyId)?.size || 0
  }

  /**
   * Get queued request count for a user
   * Since better-queue doesn't expose getLength, we track it manually
   */
  async getQueueLength(userKeyId: string): Promise<number> {
    return this.queuedRequests.get(userKeyId)?.size || 0
  }

  /**
   * Get processing count (currently executing)
   */
  getProcessingCount(userKeyId: string): number {
    return this.getActiveCount(userKeyId)
  }

  /**
   * Mark job as active
   */
  private markJobActive(userKeyId: string, requestId: string): void {
    if (!this.activeRequests.has(userKeyId)) {
      this.activeRequests.set(userKeyId, new Set())
    }
    this.activeRequests.get(userKeyId)!.add(requestId)
  }

  /**
   * Mark job as completed
   */
  private markJobCompleted(userKeyId: string, requestId: string): void {
    const activeSet = this.activeRequests.get(userKeyId)
    if (activeSet) {
      activeSet.delete(requestId)
      if (activeSet.size === 0) {
        this.activeRequests.delete(userKeyId)
      }
    }
  }

  /**
   * Mark job as queued
   */
  private markJobQueued(userKeyId: string, requestId: string): void {
    if (!this.queuedRequests.has(userKeyId)) {
      this.queuedRequests.set(userKeyId, new Set())
    }
    this.queuedRequests.get(userKeyId)!.add(requestId)
  }

  /**
   * Mark job as dequeued (no longer in queue)
   */
  private markJobDequeued(userKeyId: string, requestId: string): void {
    const queuedSet = this.queuedRequests.get(userKeyId)
    if (queuedSet) {
      queuedSet.delete(requestId)
      if (queuedSet.size === 0) {
        this.queuedRequests.delete(userKeyId)
      }
    }
  }

  /**
   * Clear queue for a user (for testing/admin)
   */
  async clearQueue(userKeyId: string): Promise<void> {
    const queue = this.userQueues.get(userKeyId)
    if (queue) {
      await new Promise<void>((resolve) => {
        queue.destroy(() => {
          resolve()
        })
      })
      this.userQueues.delete(userKeyId)
    }
    this.activeRequests.delete(userKeyId)
    this.queuedRequests.delete(userKeyId)
  }

  /**
   * Get queue status (for monitoring)
   */
  async getStatus(userKeyId?: string): Promise<{
    totalActive: number
    totalQueued: number
    users: Array<{ userKeyId: string; active: number; queued: number }>
  }> {
    if (userKeyId) {
      const queued = await this.getQueueLength(userKeyId)
      return {
        totalActive: this.getActiveCount(userKeyId),
        totalQueued: queued,
        users: [{
          userKeyId,
          active: this.getActiveCount(userKeyId),
          queued,
        }],
      }
    }

    // Aggregate all users
    const users: Array<{ userKeyId: string; active: number; queued: number }> = []
    let totalActive = 0
    let totalQueued = 0

    for (const [uid] of this.userQueues) {
      const active = this.getActiveCount(uid)
      const queued = await this.getQueueLength(uid)
      
      totalActive += active
      totalQueued += queued
      
      users.push({
        userKeyId: uid,
        active,
        queued,
      })
    }

    return {
      totalActive,
      totalQueued,
      users,
    }
  }

  /**
   * Wait for all queues to finish (for graceful shutdown)
   */
  async waitForAllQueues(): Promise<void> {
    const promises = Array.from(this.userQueues.entries()).map(([userKeyId, queue]) => {
      return new Promise<void>((resolve) => {
        // Check if queue is empty and no active jobs
        const queuedCount = this.queuedRequests.get(userKeyId)?.size || 0
        const activeCount = this.getActiveCount(userKeyId)
        
        if (queuedCount === 0 && activeCount === 0) {
          resolve()
          return
        }
        
        // Wait for drain event
        queue.on('drain', () => {
          if (this.getActiveCount(userKeyId) === 0) {
            resolve()
          }
        })
      })
    })
    
    await Promise.all(promises)
  }

  /**
   * Close all queues (for graceful shutdown)
   */
  async closeAll(): Promise<void> {
    // Wait for all queues to finish processing
    await this.waitForAllQueues()
    
    // Close all queues
    const closePromises = Array.from(this.userQueues.values()).map(queue => {
      return new Promise<void>((resolve) => {
        queue.destroy(() => {
          resolve()
        })
      })
    })
    
    await Promise.all(closePromises)
    this.userQueues.clear()
    this.activeRequests.clear()
    this.queuedRequests.clear()
  }
}

// Export singleton instance
export const queueManagerService = new QueueManagerService()
