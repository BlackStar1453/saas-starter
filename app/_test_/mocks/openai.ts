export const mockCompletion = {
  choices: [
    {
      delta: {
        content: '这是一个测试回复'
      }
    }
  ]
};

// 创建一个异步迭代器来模拟流式响应
async function* mockStream() {
  yield mockCompletion;
  return;
}

export const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn().mockImplementation(({ stream }) => {
        if (stream) {
          return mockStream();
        }
        return Promise.resolve(mockCompletion);
      })
    }
  }
};