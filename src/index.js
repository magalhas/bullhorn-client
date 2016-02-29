import defaults from 'lodash.defaults';
import omit from 'lodash.omit';
import request from 'superagent';
import url from 'url';
import Q from 'q';

export default class BullhornClient {
  constructor (options = {}) {
    this.options = defaults(options, {
      authEndpoint: 'https://auth.bullhornstaffing.com/oauth/',
      apiRoot: 'https://rest.bullhornstaffing.com/rest-services/',
      version: '2.0',
      username: '',
      password: '',
      clientId: '',
      clientSecret: '',
      logger: console.log
    });

    this.logger = this.options.logger;
  }

  buildUrl (path) {
    return this._restUrl + `${path}`;
  }

  associateCandidateToTeersheet (teersheetId, candidateIds) {
    return this
      .setup()
      .then((restToken) => {
        const deferred = Q.defer();

        this.logger('Associating candidate to tearsheet', {
          teersheetId,
          candidateIds: candidateIds.join(',')
        });

        request
          .put(this.buildUrl(`entity/Tearsheet/${teersheetId}/candidates/${candidateIds.join(',')}`))
          .query({
            BhRestToken: restToken
          })
          .end((error, res) => {
            if (error) {
              deferred.reject(error);
            } else {
              deferred.resolve(res.body);
            }
          });

        return deferred.promise;
      });
  }

  createCandidate (candidate) {
    const _createCandidate = () => {
      return Q()
        .then((restToken) => {
          const deferred = Q.defer();

          request
          .put(this.buildUrl('entity/Candidate'))
          .query({
            BhRestToken: restToken
          })
          .send(candidate)
          .end((error, res) => {
            if (error) {
              deferred.reject(error);
            } else {
              deferred.resolve(res.body.changedEntityId);
            }
          });

          return deferred.promise;
        });
    }

    return this
      .setup()
      .then(() => {
        const {email} = candidate;
        var promise;

        if (email) {
          promise = this
            .getCandidateByEmail(email)
            .then((candidateId) => {
              var result;
              if (candidateId) {
                result = candidateId;
              } else {
                result = _createCandidate();
              }
              return result;
            });
        } else {
          promise = _createCandidate();
        }

        return promise;
      });
  }

  createJobSumission (jobSubmission) {
    return this
      .setup()
      .then((restToken) => {
        const deferred = Q.defer();

        this.logger('Creating job submission', {
          jobSubmission
        });

        request
          .put(this.buildUrl('entity/JobSubmission'))
          .query({
            BhRestToken: restToken
          })
          .send(jobSubmission)
          .end((error, res) => {
            if (error) {
              deferred.reject(error);
            } else {
              deferred.resolve(res.body);
            }
          });

        return deferred.promise;
      });
  }

  createCandidateAndJobSubmission (jobId, candidate) {
    return this
      .createCandidate(omit(candidate, ['file', 'fileName']))
      .then((candidateId) => {
        const promises = [];

        promises.push(this.createJobSumission({
          candidate: {
            id: candidateId
          },
          jobOrder: {
            id: jobId
          },
          status: 'New Lead',
          dateWebResponse: new Date().getTime()
        }));

        if (candidate.file) {
          promises.push(this.sendFile('Candidate/' + candidateId, candidate.file, candidate.fileName));
        }

        return Q.all(promises);
      });
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

    this.logger('Getting authorization code');

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

        this.logger('Getting access token');

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

  getCandidateByEmail (email, fields = ['*']) {
    return this
      .setup()
      .then((restToken) => {
        var deferred = Q.defer();

        this.logger('Finding candidate by e-mail', {
          email,
          fields: fields.join(',')
        });

        request
          .get(this.buildUrl('find'))
          .query({
            BhRestToken: restToken,
            query: email
          })
          .end((error, res) => {
            if (error) {
              console.log(error);
              deferred.reject(error);
            } else {
              let entityId;
              res.body.data.forEach((entry) => {
                if (entry.entityType === 'Candidate') {
                  entityId = entry.entityId;
                }
              });
              deferred.resolve(entityId);
            }
          });

        return deferred.promise;
      });
  }

  getOpenJobs (fields = ['*']) {
    return this
      .setup()
      .then((restToken) => {
        var deferred = Q.defer();

        this.logger('Getting open jobs', {
          fields: fields.join(',')
        });

        request
          .get(this.buildUrl('query/JobOrder'))
          .query({
            BhRestToken: restToken,
            fields: fields.join(','),
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

  sendFile (entity, base64file, filename) {
    return this
      .setup()
      .then((restToken) => {
        const deferred = Q.defer();

        this.logger('Sending file', {
          entity,
          filename
        });

        request
          .put(this.buildUrl('file/' + entity))
          .send({
            externalID: 'cv',
            fileContent: base64file,
            fileType: 'SAMPLE',
            name: filename
          })
          .query({
            BhRestToken: restToken
          })
          .end((error, res) => {
            if (error) {
              deferred.reject(error);
            } else {
              deferred.resolve(res.body);
            }
          });

        return deferred.promise;
      });
  }

  shouldGetRestToken () {
    var should = false;
    const now = new Date().getTime();

    // If more than 8 minutes passed we should get a new token
    if (!this._loginAt || now - this._loginAt > 8 * 60 * 1000) {
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
