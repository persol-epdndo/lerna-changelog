"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const GithubAPI = require.requireActual("../github-api").default;
class MockedGithubAPI extends GithubAPI {
    getAuthToken() {
        return "123";
    }
}
exports.default = MockedGithubAPI;
