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

export class QueueManagerService {
  private userQueues: Map<string, Queue<QueuedRequestData>> = new Map()
  private activeRequests: Map<string, Set<string>> = new Map()
  private queuedRequests: Map<string, Set<string>> = new Map()
  
  private db: Database.Database
  private readonly config: QueueConfig = {
    maxConcurrentPerUser: 5,
    maxQueuePerUser: 10,
    requestTimeoutMs: 120000,
  }

  constructor(db?: Database.Database, config?: Partial<QueueConfig>) {
    this.db = db || getDatabase()
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  private getUserQueue(userKeyId: string): Queue<QueuedRequestData> {
    if (!this.userQueues.has(userKeyId)) {
      const dbPath = this.db.name
      
      const store = new SQLiteStore({
        path: dbPath,
        tableName: `queue_${userKeyId.replace(/[^a-zA-Z0-9]/g, '_')}`,
      })

      const queue = new Queue<QueuedRequestData>(
        async (input: QueuedRequestData, cb: (error: Error | null, result?: QueuedRequestData) => void) => {
          this.markJobActive(userKeyId, input.requestId)
          this.markJobDequeued(userKeyId, input.requestId)
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
      
      queue.on('task_finish', (id: string) => {
        this.markJobCompleted(userKeyId, id)
        this.markJobDequeued(userKeyId, id)
      })

      queue.on('task_failed', (id: string) => {
        this.markJobCompleted(userKeyId, id)
        this.markJobDequeued(userKeyId, id)
      })

      this.userQueues.set(userKeyId, queue)
    }
    
    return this.userQueues.get(userKeyId)!
  }

  async canProceed(userKeyId: string): Promise<boolean> {
    const queueLength = await this.getQueueLength(userKeyId)
    const activeCount = this.getActiveCount(userKeyId)
    
    return activeCount < this.config.maxConcurrentPerUser
  }

  async acquireSlot(
    userKeyId: string,
    requestId: string,
    jobData: QueuedRequestData
  ): Promise<void> {
    const queue = this.getUserQueue(userKeyId)
    
    const queueLength = await this.getQueueLength(userKeyId)
    const activeCount = this.getActiveCount(userKeyId)
    
    if (activeCount >= this.config.maxConcurrentPerUser && 
        queueLength >= this.config.maxQueuePerUser) {
      throw new Error(
        `Queue full for user. Active: ${activeCount}, Queued: ${queueLength}`
      )
    }

    if (activeCount >= this.config.maxConcurrentPerUser) {
      this.markJobQueued(userKeyId, requestId)
      
      return new Promise<void>((resolve, reject) => {
        queue.push(jobData, (err: Error | null) => {
          if (err) {
            this.markJobDequeued(userKeyId, requestId)
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }

    this.markJobActive(userKeyId, requestId)
  }

  releaseSlot(userKeyId: string, requestId: string): void {
    this.markJobCompleted(userKeyId, requestId)
  }

  getActiveCount(userKeyId: string): number {
    return this.activeRequests.get(userKeyId)?.size || 0
  }

  async getQueueLength(userKeyId: string): Promise<number> {
    return this.queuedRequests.get(userKeyId)?.size || 0
  }

  getProcessingCount(userKeyId: string): number {
    return this.getActiveCount(userKeyId)
  }

  private markJobActive(userKeyId: string, requestId: string): void {
    if (!this.activeRequests.has(userKeyId)) {
      this.activeRequests.set(userKeyId, new Set())
    }
    this.activeRequests.get(userKeyId)!.add(requestId)
  }

  private markJobCompleted(userKeyId: string, requestId: string): void {
    const activeSet = this.activeRequests.get(userKeyId)
    if (activeSet) {
      activeSet.delete(requestId)
      if (activeSet.size === 0) {
        this.activeRequests.delete(userKeyId)
      }
    }
  }

  private markJobQueued(userKeyId: string, requestId: string): void {
    if (!this.queuedRequests.has(userKeyId)) {
      this.queuedRequests.set(userKeyId, new Set())
    }
    this.queuedRequests.get(userKeyId)!.add(requestId)
  }

  private markJobDequeued(userKeyId: string, requestId: string): void {
    const queuedSet = this.queuedRequests.get(userKeyId)
    if (queuedSet) {
      queuedSet.delete(requestId)
      if (queuedSet.size === 0) {
        this.queuedRequests.delete(userKeyId)
      }
    }
  }

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

  async waitForAllQueues(): Promise<void> {
    const promises = Array.from(this.userQueues.entries()).map(([userKeyId, queue]) => {
      return new Promise<void>((resolve) => {
        const queuedCount = this.queuedRequests.get(userKeyId)?.size || 0
        const activeCount = this.getActiveCount(userKeyId)
        
        if (queuedCount === 0 && activeCount === 0) {
          resolve()
          return
        }
        
        queue.on('drain', () => {
          if (this.getActiveCount(userKeyId) === 0) {
            resolve()
          }
        })
      })
    })
    
    await Promise.all(promises)
  }

  async closeAll(): Promise<void> {
    await this.waitForAllQueues()
    
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

export const queueManagerService = new QueueManagerService()
