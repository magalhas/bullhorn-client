import defaults from 'lodash.defaults';
import Q from 'q';
import request from 'superagent';
import url from 'url';

export default class BullhornClient {
  constructor (options = {}) {
    this.options = defaults(options, {
      authEndpoint: 'https://auth.bullhornstaffing.com/oauth/',
      apiRoot: 'https://rest.bullhornstaffing.com/rest-services/',
      version: '2.0',
      username: '',
      password: '',
      clientId: '',
      clientSecret: ''
    });
  }

  buildUrl (path) {
    return this._restUrl + `${path}`;
  }

  login () {
    return this
      .getAccessToken()
      .then((accessToken) => {
        const deferred = Q.defer();

        request
          .get(this.options.apiRoot + 'login')
          .query({
            version: this.options.version,
            access_token: accessToken
          })
          .end((error, res) => {
            if (error) {
              deferred.reject(error);
            } else {
              this._loginAt = new Date().getTime();
              this._restUrl = res.body.restUrl;
              this._BhRestToken = res.body.BhRestToken;
              deferred.resolve(res.body);
            }
          });

        return deferred.promise;
      });

  }

  getAuthorizationCode () {
    const deferred = Q.defer();
    const {username, password, clientId: client_id} = this.options;

    request
      .post(this.options.authEndpoint + 'authorize')
      .type('form')
      .query({
        client_id,
        response_type: 'code',
        action: 'Login'
      })
      .send({
        username,
        password
      })
      .end((error, res) => {
        if (error) {
          deferred.reject(error);
        } else {
          const code = url.parse(res.redirects[0], true).query.code;
          deferred.resolve(code);
        }
      });

    return deferred.promise;
  }

  getAccessToken (type = 'authorization_code') {
    const {clientId: client_id, clientSecret: client_secret} = this.options;

    return this
      .getAuthorizationCode()
      .then((code) => {
        const deferred = Q.defer();

        request
          .post(this.options.authEndpoint + 'token')
          .query({
            code,
            client_id,
            client_secret,
            grant_type: type
          })
          .end((error, res) => {
            if (error) {
              deferred.reject(error);
            } else {
              this._refreshToken = res.body.refresh_token;
              deferred.resolve(res.body.access_token);
            }
          });

        return deferred.promise;
      });
  }

  getOpenJobs () {
    return this
      .setup()
      .then((restToken) => {
        var deferred = Q.defer();

        request
          .get(this.buildUrl('query/JobOrder'))
          .query({
            BhRestToken: restToken,
            fields: '*',
            where: 'isOpen=true',
            count: 499
          })
          .end((error, res) => {
            if (error) {
              deferred.reject(error);
            } else {
              deferred.resolve(res.body.data);
            }
          });

        return deferred.promise;
      });
  }

  getRestToken () {
    return this
      .login()
      .then((res) => {
        return res.BhRestToken;
      });
  }

  shouldGetRestToken () {
    var should = false;
    const now = new Date().getTime();

    // If more than 8 minutes passed we should get a new token
    if (!this._loginAt || this._loginAt - now > 8 * 60 * 1000) {
      should = true;
    }

    return should;
  }

  setup () {
    return Q()
      .then(() => {
        var result;
        if (this.shouldGetRestToken()) {
          result = this.getRestToken();
        } else {
          result = this._BhRestToken;
        }
        return result;
      });
  }

}
