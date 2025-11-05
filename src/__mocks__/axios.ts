const mockAxiosPost = jest.fn();
const mockAxiosGet = jest.fn(); // For the instance methods
const mockAxiosCreate = jest.fn((config) => ({
  post: jest.fn((url, ...args) => {
    const fullUrl = config?.baseURL ? `${config.baseURL}${url}` : url;
    return mockAxiosPost(fullUrl, ...args);
  }),
  get: jest.fn((url, ...args) => {
    const fullUrl = config?.baseURL ? `${config.baseURL}${url}` : url;
    return mockAxiosGet(fullUrl, ...args);
  }),
}));
const mockAxiosIsAxiosError = jest.fn();
const mockAxiosTopLevelGet = jest.fn(); // For the top-level axios.get

const axios = {
  __esModule: true,
  default: { create: mockAxiosCreate, isAxiosError: mockAxiosIsAxiosError, get: mockAxiosTopLevelGet },
  create: mockAxiosCreate,
  isAxiosError: mockAxiosIsAxiosError,
  get: mockAxiosTopLevelGet,
};

export default axios;
export { mockAxiosCreate, mockAxiosPost, mockAxiosGet, mockAxiosIsAxiosError, mockAxiosTopLevelGet };
