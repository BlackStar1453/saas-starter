export const verifyAuth = jest.fn().mockImplementation(() => ({
    success: true,
    userId: 'test-user-id'
  }));