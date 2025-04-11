import React, { useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { LLMMessage, LangCode, Message } from '../types'
import { useLLMEngine } from '../contexts/LLMEngineContext'
import { useSettings } from '../contexts/SettingsContext'
import { useMessages } from '../contexts/MessagesContext'
import { useConversation } from '../contexts/ConversationContext'
import { useStreamingMessage } from '../contexts/StreamingMessageContext'

const WordPopup: React.FC = () => {
    const { t } = useTranslation()
    const LLMEngine = useLLMEngine()
    const settings = useSettings()
    const messages = useMessages()
    const conversation = useConversation()
    const streamingMessageRef = useStreamingMessage()

    const handleAskSubmit = useCallback(
        async (text: string, index: number, saveKey?: string, quickActionText?: string) => {
            if (!LLMEngine) {
                toast.error(t('LLM Engine not defined'))
                return
            }

            // 验证输入
            const inputText = text || quickActionText
            if (!inputText) {
                toast.error(t('Please enter your question'))
                return
            }

            // 重置状态
            setIsLoading(true)
            setResponse('')
            let currentResponse = ''
            messageAddedRef.current = false

            const abortController = new AbortController()
            // 准备用户消息
            const userMessage: LLMMessage = {
                role: 'user',
                content: quickActionText || text,
                createdAt: Date.now(),
                messageId: crypto.randomUUID(),
            }

            try {
                // 检查用户是否有自己的引擎配置
                const hasCustomEngine = Boolean(LLMEngine.apiKey); // 假设 apiKey 存在表示用户有自己的引擎

                // 准备 API 请求的基础配置
                const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings?.authToken}` // 假设 authToken 存储在 settings 中
                };

                // 根据用户是否有自己的引擎选择不同的 API 端点
                if (hasCustomEngine) {
                    // 调用 hasEngine API 检查权限
                    const checkResponse = await fetch(`${apiBaseUrl}/api/hasEngine`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            model: LLMEngine.model || 'gpt-3.5-turbo',
                            query: inputText
                        })
                    });

                    const checkResult = await checkResponse.json();
                    
                    if (!checkResponse.ok) {
                        throw new Error(checkResult.error?.message || 'Failed to check usage quota');
                    }

                    if (!checkResult.success || !checkResult.canProceed) {
                        throw new Error('Usage quota exceeded');
                    }
                } else {
                    // 直接调用 hasNotEngine API
                    const aiResponse = await fetch(`${apiBaseUrl}/api/hasNotEngine`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            query: inputText
                        })
                    });

                    const aiResult = await aiResponse.json();
                    
                    if (!aiResponse.ok) {
                        throw new Error(aiResult.error?.message || 'Failed to get AI response');
                    }

                    if (!aiResult.success) {
                        throw new Error(aiResult.error?.message || 'Failed to process request');
                    }

                    // 直接使用平台返回的响应
                    currentResponse = aiResult.content;
                    setResponse(currentResponse);
                    
                    // 添加系统消息（如果是会话的第一条消息）
                    if (messages.length === 0 && context) {
                        const systemMessage = {
                            role: 'system',
                            content: `context: ${context} \n\n Please respond in ${settings?.defaultUserLanguage}`,
                            createdAt: Date.now(),
                            messageId: crypto.randomUUID(),
                        };
                        addMessageToHistory(systemMessage);
                        currentConversationMessages.push(systemMessage);
                    }

                    // 添加用户消息和 AI 响应到历史
                    addMessageToHistory(userMessage);
                    currentConversationMessages.push(userMessage);

                    const assistantMessage = {
                        role: 'assistant',
                        content: currentResponse,
                        createdAt: Date.now(),
                        messageId: crypto.randomUUID(),
                    };
                    addMessageToHistory(assistantMessage);
                    currentConversationMessages.push(assistantMessage);

                    // 更新对话历史
                    updateLocalConversationMessages(currentConversationMessages);
                    handleSendToBackground(currentConversationMessages);

                    setIsLoading(false);
                    return; // 直接返回，不执行后续的 AI 调用
                }

                // 如果用户有自己的引擎，继续使用原有的 AI 调用逻辑
                // 添加系统消息（如果是会话的第一条消息）
                if (messages.length === 0 && context) {
                    addMessageToHistory({
                        role: 'system',
                        content: `context: ${context} \n\n Please respond in ${settings?.defaultUserLanguage}`,
                        createdAt: Date.now(),
                        messageId: crypto.randomUUID(),
                    })
                    currentConversationMessages.push({
                        role: 'system',
                        content: `context: ${context} \n\n Please respond in ${settings?.defaultUserLanguage}`,
                        createdAt: Date.now(),
                        messageId: crypto.randomUUID(),
                    })
                }

                // 添加用户消息到历史
                addMessageToHistory(userMessage)
                currentConversationMessages.push(userMessage)

                // 创建一个响应消息ID，确保一致性
                const responseMessageId = crypto.randomUUID()

                await askAIWithoutHistory({
                    activateAction: undefined,
                    userLang: settings?.defaultUserLanguage as LangCode,
                    text: inputText,
                    context: context,
                    conversationMessages: currentConversationMessages,
                    onMessage: (message) => {
                        if (!message.content) return

                        setResponse((prevResponse) => {
                            const newResponse = message.isFullText ? message.content : prevResponse + message.content
                            currentResponse = newResponse
                            return newResponse
                        })

                        setMessages((prev) => {
                            if (message.isFullText || !streamingMessageRef.current) {
                                const completeMessage: Message = {
                                    role: 'assistant',
                                    content: message.content,
                                    createdAt: Date.now(),
                                    messageId: responseMessageId,
                                }
                                streamingMessageRef.current = completeMessage
                                return [...prev, completeMessage]
                            } else {
                                return prev.map((msg) => {
                                    if (msg.messageId === responseMessageId) {
                                        const updatedMessage = {
                                            ...msg,
                                            content: message.isFullText
                                                ? message.content
                                                : msg.content + message.content,
                                        }
                                        streamingMessageRef.current = updatedMessage
                                        return updatedMessage
                                    }
                                    return msg
                                })
                            }
                        })
                        setIsLoading(false)
                    },
                    onFinished: () => {
                        setTimeout(() => {
                            if (!messageAddedRef.current) {
                                messageAddedRef.current = true

                                setMessages((prev) => {
                                    return prev.map((msg) => {
                                        if (msg.messageId === responseMessageId) {
                                            return {
                                                ...msg,
                                                content: currentResponse,
                                            }
                                        }
                                        return msg
                                    })
                                })

                                const finalMessage: Message = {
                                    role: 'assistant',
                                    content: currentResponse,
                                    createdAt: Date.now(),
                                    messageId: responseMessageId,
                                }

                                currentConversationMessages.push(finalMessage)

                                setTimeout(() => {
                                    handleSendToBackground(currentConversationMessages)
                                }, 500)

                                updateLocalConversationMessages(currentConversationMessages)

                                streamingMessageRef.current = null
                            }

                            setIsLoading(false)
                            setQuestion('')
                        }, 100)
                    },
                    onError: (error) => {
                        const errorMessage = t('错误: {{error}}', { error })
                        setResponse((prev) => {
                            const message = prev ? `${prev}\n\n---\n\n${errorMessage}` : errorMessage
                            return message
                        })
                        toast.error(errorMessage)
                        setIsLoading(false)
                    },
                    signal: abortController.signal,
                })
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : t('未知错误')

                console.error('提交问题失败:', error)
                setResponse(t('获取回答失败: {{error}}', { error: errorMessage }) || `获取回答失败: ${errorMessage}`)
                toast.error(errorMessage)
            } finally {
                setIsLoading(false)
            }
        },
        [
            LLMEngine,
            t,
            messages.length,
            context,
            currentConversationMessages,
            settings?.defaultUserLanguage,
            settings?.authToken, // 添加 authToken 依赖
            updateLocalConversationMessages,
            handleSendToBackground,
        ]
    )

    return (
        <div>
            {/* Render your component content here */}
        </div>
    )
}

export default WordPopup 