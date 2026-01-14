import { useEffect, useState, useRef } from "react";
import { useChatContext } from "~/Providers";
import {
  extractAllToolCalls,
  extractToolCallsByMessage,
} from "~/utils/parseDatServerResponse";
import type {
  ToolCallWithThoughtChain,
  MessageToolCalls,
} from "~/utils/parseDatServerResponse";

/**
 * Hook 从当前消息中提取所有工具调用（包括有思维链和没有思维链的）
 * 返回所有工具调用的数组并支持分页
 */
export function useToolCallsWithThoughtChains(): {
  toolCalls: ToolCallWithThoughtChain[];
  toolCallsByMessage: MessageToolCalls[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  currentToolCall: ToolCallWithThoughtChain | null;
  hasNext: boolean;
  hasPrevious: boolean;
  goToNext: () => void;
  goToPrevious: () => void;
} {
  const { getMessages } = useChatContext();
  const [toolCalls, setToolCalls] = useState<ToolCallWithThoughtChain[]>([]);
  const [toolCallsByMessage, setToolCallsByMessage] = useState<
    MessageToolCalls[]
  >([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const lastMessagesRef = useRef<string>("");

  const lastToolCallsRef = useRef<ToolCallWithThoughtChain[]>([]);
  const lastToolCallsByMessageRef = useRef<MessageToolCalls[]>([]);
  const lastToolCallsHashRef = useRef<string>("");
  const currentIndexRef = useRef<number>(0);

  // 同步 currentIndex 到 ref
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // 用于检测工具调用的消息更新轮询
  useEffect(() => {
    const checkMessages = () => {
      try {
        const messages = getMessages();
        if (!messages || messages.length === 0) {
          if (lastToolCallsRef.current.length > 0) {
            setToolCalls([]);
            setToolCallsByMessage([]);
            setCurrentIndex(0);
            currentIndexRef.current = 0;
            lastToolCallsRef.current = [];
            lastToolCallsByMessageRef.current = [];
            lastToolCallsHashRef.current = "";
            lastMessagesRef.current = "";
          }
          return;
        }

        // 创建消息的哈希来检测变化
        // 必须包含工具调用的 args 和 output，以便检测流式传输的更新
        const messagesHash = JSON.stringify(
          messages.map((m: any) => {
            const toolCallContents =
              m.content?.filter((c: any) => c && c.type === "tool_call") || [];
            return {
              id: m.messageId,
              unfinished: m.unfinished,
              contentLength: m.content?.length || 0,
              // 关键：包含每个工具调用的完整数据以检测流式更新
              toolCalls: toolCallContents.map((tc: any) => {
                const toolCall = tc.tool_call || tc;
                const func = toolCall.function || toolCall;
                return {
                  name: func.name,
                  args: func.arguments || toolCall.args,
                  output: func.output || toolCall.output,
                  progress: toolCall.progress,
                };
              }),
            };
          }),
        );

        // 如果消息没有变化，跳过解析
        if (messagesHash === lastMessagesRef.current) {
          return;
        }

        lastMessagesRef.current = messagesHash;

        const extracted = extractAllToolCalls(messages);
        const extractedByMessage = extractToolCallsByMessage(messages);

        // 只在工具调用数据真正变化时更新状态
        const extractedHash = JSON.stringify(extracted);

        if (extractedHash !== lastToolCallsHashRef.current) {
          const previousLength = lastToolCallsRef.current.length;
          lastToolCallsHashRef.current = extractedHash;
          setToolCalls(extracted);
          setToolCallsByMessage(extractedByMessage);
          lastToolCallsByMessageRef.current = extractedByMessage;

          // 如果有新的工具调用，自动切换到最新的（最后一个）
          if (extracted.length > 0 && extracted.length > previousLength) {
            const newIndex = extracted.length - 1;
            setCurrentIndex(newIndex);
            currentIndexRef.current = newIndex;
          } else if (
            extracted.length > 0 &&
            currentIndexRef.current >= extracted.length
          ) {
            // 如果当前索引超出范围，调整到最后一个
            const newIndex = extracted.length - 1;
            setCurrentIndex(newIndex);
            currentIndexRef.current = newIndex;
          } else if (extracted.length === 0) {
            setCurrentIndex(0);
            currentIndexRef.current = 0;
          }

          lastToolCallsRef.current = extracted;
        }
      } catch (error) {
        console.warn("Error extracting tool calls:", error);
        if (lastToolCallsRef.current.length > 0) {
          setToolCalls([]);
          setToolCallsByMessage([]);
          setCurrentIndex(0);
          currentIndexRef.current = 0;
          lastToolCallsRef.current = [];
          lastToolCallsByMessageRef.current = [];
          lastToolCallsHashRef.current = "";
        }
      }
    };

    // 立刻检查
    checkMessages();

    // 使用较短的轮询间隔 (100ms) 实现接近实时的更新
    // 这样可以快速响应 SSE 推送的消息更新
    const interval = setInterval(checkMessages, 100);

    return () => clearInterval(interval);
  }, [getMessages]);

  const currentToolCall =
    toolCalls.length > 0 && currentIndex >= 0 && currentIndex < toolCalls.length
      ? toolCalls[currentIndex]
      : null;

  const hasNext = currentIndex < toolCalls.length - 1;
  const hasPrevious = currentIndex > 0;

  const goToNext = () => {
    if (hasNext) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    if (hasPrevious) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return {
    toolCalls,
    toolCallsByMessage,
    currentIndex,
    setCurrentIndex,
    currentToolCall,
    hasNext,
    hasPrevious,
    goToNext,
    goToPrevious,
  };
}
