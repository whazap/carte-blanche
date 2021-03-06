import supertest from 'supertest';
import path from 'path';
import { expect } from 'chai';
import fs from 'fs';
import rimraf from 'rimraf';

const hostname = 'localhost';
const port = 8083;
const variationFolderName = 'variations';
const projectBasePath = __dirname;
const variationsBasePath = path.join(__dirname, variationFolderName);
const request = supertest.agent(`http://${hostname}:${port}`);

describe('server', () => {
  let server;

  beforeEach(() => {
    delete require.cache[require.resolve('./server')];
    server = require('../server'); // eslint-disable-line global-require
    server.start(projectBasePath, variationsBasePath, {
      port,
      hostname,
      variationFolderName,
    });
  });

  afterEach((done) => {
    server.stop(done);
  });

  describe('GET:variations', () => {
    it('should get all data for a valid component with variations data', (done) => {
      request
        .get('/variations/components/ComponentA.js')
        .expect('Content-type', /json/)
        .expect(200)
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.error).to.be.undefined; // eslint-disable-line no-unused-expressions
          expect(res.body.data).to.have.keys(['firstVariation', 'secondVariation']);

          let firstVariation;
          eval(`firstVariation = ${res.body.data.firstVariation}`); // eslint-disable-line no-eval
          const expected = {
            props: {
              className: {
                value: 'component-a',
              },
              age: {
                value: 22,
                min: 0,
                max: 140,
              },
            },
            state: {
              focusedAge: {
                value: 19,
                min: 0,
                max: 140,
              },
            },
          };
          expect(firstVariation).to.deep.equal(expected); // eslint-disable-line no-undef

          let secondVariation;
          eval(`secondVariation = ${res.body.data.secondVariation}`); // eslint-disable-line no-eval, max-len
          const secondExpected = {
            props: {
              age: {
                value: null,
              },
            },
            state: {
              focusedAge: {
                value: 10,
              },
            },
          };
          expect(secondVariation).to.deep.equal(secondExpected); // eslint-disable-line no-undef
          done();
        });
    });

    it('should get all data for a deeper nested component with variations data', (done) => {
      request
        .get('/variations/components/otherComponents/ComponentD.js')
        .expect('Content-type', /json/)
        .expect(200)
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.error).to.be.undefined; // eslint-disable-line no-unused-expressions
          expect(res.body.data).to.have.keys(['testVariation']);

          let testVariation;
          eval(`testVariation = ${res.body.data.testVariation}`); // eslint-disable-line no-eval
          const expected = {
            props: {
              age: 22,
            },
          };
          expect(testVariation).to.deep.equal(expected); // eslint-disable-line no-undef
          done();
        });
    });

    it('should return a 404 in case the component does not exist', (done) => {
      request
        .get('/variations/variations/components/ComponentNotAvailable.js')
        .expect('Content-type', /json/)
        .expect(404)
        .end((err, res) => {
          expect(res.status).to.equal(404);
          done();
        });
    });
  });

  describe('DELETE:variations', () => {
    it('should remove the variation', (done) => {
      const variationPath = path.join(
        variationsBasePath,
        'components',
        'ComponentA',
        'v-toBeRemoved.js'
      );
      fs.closeSync(fs.openSync(variationPath, 'w'));

      request
        .delete('/variations/components/ComponentA.js?variation=toBeRemoved')
        .expect('Content-type', /json/)
        .expect(200)
        .end((err, res) => {
          expect(res.status).to.equal(200);
          done();
        });
    });

    it('should fail in case the component does not exist', (done) => {
      request
        .delete('/variations/components/ComponentNotAvailable.js')
        .expect('Content-type', /json/)
        .expect(404)
        .end((err, res) => {
          expect(res.status).to.equal(404);
          done();
        });
    });

    it('should fail in case the variation does not exist', (done) => {
      request
        .delete('/variations/variations/components/ComponentA.js?variation=notAvailableVariation')
        .expect('Content-type', /json/)
        .expect(404)
        .end((err, res) => {
          expect(res.status).to.equal(404);
          done();
        });
    });
  });

  describe('POST:variations', () => {
    const code = `{
      props: {
        name: {
          value: 'Ada Lovelace',
        },
        onClick: {
          value: () => true,
        },
      },
    };`;

    describe('write new variation', () => {
      const variationComponentPath = path.join(
        variationsBasePath,
        'components',
        'ComponentB',
      );
      const variationPath = path.join(variationComponentPath, 'v-newVariation.js');

      afterEach((done) => {
        rimraf(variationComponentPath, done);
      });

      it('should create a new file with the provided data', (done) => {
        request
          .post('/variations/components/ComponentB/index.js')
          .type('json')
          .send({
            variation: 'newVariation',
            code,
          })
          .expect(200)
          .end((err, res) => {
            expect(res.status).to.equal(200);
            fs.readFile(variationPath, { encoding: 'utf8' }, (_, fileContent) => {
              expect(`module.exports = ${code}`).to.equal(fileContent);
              done();
            });
          });
      });
    });

    describe('write new variation in nested path', () => {
      const variationComponentPath = path.join(
        variationsBasePath,
        'components',
        'otherComponents',
        'ComponentE',
      );
      const variationPath = path.join(variationComponentPath, 'v-newVariation.js');

      afterEach((done) => {
        rimraf(variationComponentPath, done);
      });

      it('should create a new file with the provided data', (done) => {
        request
          .post('/variations/components/otherComponents/ComponentE.js')
          .type('json')
          .send({
            variation: 'newVariation',
            code,
          })
          .expect(200)
          .end((err, res) => {
            expect(res.status).to.equal(200);
            fs.readFile(variationPath, { encoding: 'utf8' }, (_, fileContent) => {
              expect(`module.exports = ${code}`).to.equal(fileContent);
              done();
            });
          });
      });
    });

    describe('overwrite existing variation', () => {
      const variationPath = path.join(
        variationsBasePath,
        'components',
        'ComponentA',
        'v-existingVariation.js'
      );

      afterEach((done) => {
        fs.unlink(variationPath, () => {
          done();
        });
      });

      it('should overwrite the existing file with the provided data', (done) => {
        fs.closeSync(fs.openSync(variationPath, 'w'));

        request
          .post('/variations/components/ComponentA.js')
          .type('json')
          .send({
            variation: 'existingVariation',
            code,
          })
          .expect(200)
          .end((err, res) => {
            expect(res.status).to.equal(200);
            fs.readFile(variationPath, { encoding: 'utf8' }, (_, fileContent) => {
              expect(`module.exports = ${code}`).to.equal(fileContent);
              done();
            });
          });
      });
    });

    it('should fail in case the component does not exist', (done) => {
      request
        .post('/variations/components/ComponentNotAvailable.js')
        .expect('Content-type', /json/)
        .expect(404)
        .end((err, res) => {
          expect(res.status).to.equal(404);
          done();
        });
    });
  });

  describe('GET:componentsMeta', () => {
    it('should get all data for a valid component with variations data', (done) => {
      request
        .get('/components/components/ComponentA.js')
        .expect('Content-type', /json/)
        .expect(200)
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.error).to.be.undefined; // eslint-disable-line no-unused-expressions

          let metadata;
          eval(`metadata = ${res.body.data}`); // eslint-disable-line no-eval
          const expected = {
            props: {
              age: {
                min: 0,
                max: 140,
              },
            },
          };
          expect(metadata).to.deep.equal(expected); // eslint-disable-line no-undef
          done();
        });
    });

    it('should return a 404 in case the component does not exist', (done) => {
      request
        .get('/components/components/ComponentNotAvailable.js')
        .expect('Content-type', /json/)
        .expect(404)
        .end((err, res) => {
          expect(res.status).to.equal(404);
          done();
        });
    });
  });

  describe('POST:componentsMeta', () => {
    const code = `{
      props: {
        age: {
          min: 0,
          max: 120,
        },
      },
    };`;

    describe('write new meta file', () => {
      const variationComponentPath = path.join(
        variationsBasePath,
        'components',
        'ComponentC'
      );
      const componentMetaPath = path.join(variationComponentPath, 'meta.js');

      afterEach((done) => {
        rimraf(variationComponentPath, done);
      });

      it('should create a new file with the provided meta data', (done) => {
        request
          .post('/components/components/ComponentC.js')
          .type('json')
          .send({
            code,
          })
          .expect(200)
          .end((err, res) => {
            expect(res.status).to.equal(200);
            fs.readFile(componentMetaPath, { encoding: 'utf8' }, (_, fileContent) => {
              expect(`module.exports = ${code}`).to.equal(fileContent);
              done();
            });
          });
      });
    });

    describe('write new meta file for a nested component', () => {
      const variationComponentPath = path.join(
        variationsBasePath,
        'components',
        'otherComponents',
        'ComponentF'
      );
      const componentMetaPath = path.join(variationComponentPath, 'meta.js');

      afterEach((done) => {
        rimraf(variationComponentPath, done);
      });

      it('should create a new file with the provided meta data', (done) => {
        request
          .post('/components/components/otherComponents/ComponentF.js')
          .type('json')
          .send({
            code,
          })
          .expect(200)
          .end((err, res) => {
            expect(res.status).to.equal(200);
            fs.readFile(componentMetaPath, { encoding: 'utf8' }, (_, fileContent) => {
              expect(`module.exports = ${code}`).to.equal(fileContent);
              done();
            });
          });
      });
    });

    it('should fail in case the component does not exist', (done) => {
      request
        .post('/components/components/ComponentNotAvailable.js')
        .expect('Content-type', /json/)
        .expect(404)
        .end((err, res) => {
          expect(res.status).to.equal(404);
          done();
        });
    });
  });
});
