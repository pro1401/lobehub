import type { ChatMessageError } from '@lobechat/types';
import { describe, expect, it, vi } from 'vitest';

import { lambdaClient } from '@/libs/trpc/client';

import { MessageService } from './index';

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    message: {
      createMessage: { mutate: vi.fn() },
      getMessages: { query: vi.fn() },
      removeMessagesByAssistant: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
    },
  },
}));

describe('MessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMessages', () => {
    const service = new MessageService();

    it('passes read parameters through without applying client cache policy', async () => {
      vi.mocked(lambdaClient.message.getMessages.query).mockResolvedValue([]);
      const params = {
        agentId: 'agent-1',
        topicId: 'topic-1',
      };

      await service.getMessages(params);

      // The service opts in to file-type works; everything else passes through untouched.
      expect(lambdaClient.message.getMessages.query).toHaveBeenCalledWith({
        ...params,
        includeFileWorks: true,
      });
    });

    it('keeps independent service reads available to strong-consistency callers', async () => {
      vi.mocked(lambdaClient.message.getMessages.query).mockResolvedValue([]);
      const context = { agentId: 'agent-1', topicId: 'topic-1' };

      await Promise.all([service.getMessages(context), service.getMessages(context)]);

      expect(lambdaClient.message.getMessages.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('createMessage', () => {
    const service = new MessageService();

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should pass params directly to lambdaClient', async () => {
      vi.mocked(lambdaClient.message.createMessage.mutate).mockResolvedValue({
        id: 'msg-1',
        messages: [],
      });

      await service.createMessage({
        content: 'test',
        role: 'user',
        agentId: 'agent-123',
      });

      expect(lambdaClient.message.createMessage.mutate).toHaveBeenCalledWith({
        content: 'test',
        role: 'user',
        agentId: 'agent-123',
      });
    });
  });

  describe('updateMessage', () => {
    const service = new MessageService();

    it('normalizes a runtime errorType before sending a message update', async () => {
      vi.mocked(lambdaClient.message.update.mutate).mockResolvedValue({
        success: true,
      });
      const malformedError = {
        body: { provider: 'newapi' },
        errorType: 'ModelNotFound',
        message: 'No available channel',
      } as unknown as ChatMessageError;

      await service.updateMessage(
        'msg-1',
        { error: malformedError },
        { agentId: 'agent-1', topicId: 'topic-1' },
      );

      expect(lambdaClient.message.update.mutate).toHaveBeenCalledWith({
        agentId: 'agent-1',
        id: 'msg-1',
        topicId: 'topic-1',
        value: {
          error: expect.objectContaining({
            body: expect.objectContaining({ provider: 'newapi' }),
            message: 'No available channel',
            type: 'ModelNotFound',
          }),
        },
      });
    });

    it('adds a stable fallback type when an error update has no runtime type', async () => {
      vi.mocked(lambdaClient.message.update.mutate).mockResolvedValue({
        success: true,
      });
      const malformedError = {
        message: 'Unclassified failure',
      } as unknown as ChatMessageError;

      await service.updateMessage('msg-1', {
        error: malformedError,
      });

      expect(lambdaClient.message.update.mutate).toHaveBeenCalledWith({
        id: 'msg-1',
        value: {
          error: expect.objectContaining({
            body: { message: 'Unclassified failure' },
            message: 'Unclassified failure',
            type: 'AgentRuntimeError',
          }),
        },
      });
    });

    it('normalizes the dedicated runtime error update path', async () => {
      vi.mocked(lambdaClient.message.update.mutate).mockResolvedValue({
        success: true,
      });
      const runtimeError = Object.assign(new Error('No available channel'), {
        errorType: 'ModelNotFound',
      }) as unknown as ChatMessageError;

      await service.updateMessageError('msg-1', runtimeError, { topicId: 'topic-1' });

      expect(lambdaClient.message.update.mutate).toHaveBeenCalledWith({
        id: 'msg-1',
        topicId: 'topic-1',
        value: {
          error: expect.objectContaining({
            body: expect.objectContaining({
              errorType: 'ModelNotFound',
              message: 'No available channel',
            }),
            message: 'No available channel',
            type: 'ModelNotFound',
          }),
        },
      });
    });
  });

  describe('removeMessagesByAssistant', () => {
    const service = new MessageService();

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should pass sessionId to lambdaClient', async () => {
      vi.mocked(lambdaClient.message.removeMessagesByAssistant.mutate).mockResolvedValue(
        undefined as any,
      );

      await service.removeMessagesByAssistant('session-123');

      expect(lambdaClient.message.removeMessagesByAssistant.mutate).toHaveBeenCalledWith({
        sessionId: 'session-123',
        topicId: undefined,
      });
    });

    it('should pass sessionId and topicId to lambdaClient', async () => {
      vi.mocked(lambdaClient.message.removeMessagesByAssistant.mutate).mockResolvedValue(
        undefined as any,
      );

      await service.removeMessagesByAssistant('session-123', 'topic-1');

      expect(lambdaClient.message.removeMessagesByAssistant.mutate).toHaveBeenCalledWith({
        sessionId: 'session-123',
        topicId: 'topic-1',
      });
    });
  });
});
