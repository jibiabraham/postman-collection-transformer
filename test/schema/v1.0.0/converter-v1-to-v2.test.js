/**
 * @fileoverview This test suite runs tests on the V1 to V2 converter.
 */

var expect = require('chai').expect,
    requireAll = require('require-all'),
    path = require('path'),
    tv4 = require('tv4'),
    _ = require('lodash').noConflict(),
    agent = require('superagent');

describe('v1.0.0 ==> v2.0.0', function () {
    var converter = require('../../../lib/converters/v1.0.0/converter-v1-to-v2'),
        reverseConverter = require('../../../lib/converters/v2.0.0/converter-v2-to-v1'),
        schemaUrl = require('../../../lib/constants').SCHEMA_V2_URL,
        examplesDir = path.join(__dirname, '../../../examples/v1.0.0');

    describe('sample conversions', function () {
        var schema,
            samples = requireAll(examplesDir);

        before(function (done) {
            agent
                .get(schemaUrl)
                .set('Cache-Control', 'no-cache; no-store; must-revalidate')
                .end(function (error, response) {
                    schema = _.isString(response.body) ? JSON.parse(response.body) : response.body;
                    done(error);
                });
        });

        _.forEach(samples, function (sample, sampleName) {
            it('must create a valid V2 collection from ' + sampleName + '.json', function (done) {
                converter.convert(sample, {}, function (err, converted) {
                    var validator = tv4.freshApi(),
                        result;

                    validator.addSchema(schema);

                    // Some of the converter functions assign "undefined" value to some properties,
                    // It is necessary to get rid of them (otherwise schema validation sees an "undefined" and fails).
                    // Converting to and parsing from JSON does this.
                    converted = JSON.parse(JSON.stringify(converted));

                    result = validator.validate(converted, schema);
                    if (!result && process.env.CI) { // eslint-disable-line no-process-env
                        console.error(JSON.stringify(validator.error, null, 4)); // Helps debug on CI
                    }
                    if (validator.missing.length) {
                        console.error(validator.missing);
                        result = false;
                    }
                    expect(err).to.equal(null);
                    expect(result).to.equal(true);
                    done();
                });
            });
        });

        _.forEach(samples, function (sample, sampleName) {
            it('must create a valid V2 collection from ' + sampleName + '.json with synchronous API', function (done) {
                var validator = tv4.freshApi(),
                    result,
                    converted;

                validator.addSchema(schema);
                converted = converter.convert(sample);

                // Some of the converter functions assign "undefined" value to some properties,
                // It is necessary to get rid of them (otherwise schema validation sees an "undefined" and fails).
                // Converting to and parsing from JSON does this.
                converted = JSON.parse(JSON.stringify(converted));

                result = validator.validate(converted, schema);
                if (!result && process.env.CI) { // eslint-disable-line no-process-env
                    console.error(JSON.stringify(validator.error, null, 4)); // Helps debug on CI
                }
                if (validator.missing.length) {
                    console.error(validator.missing);
                    result = false;
                }
                expect(result).to.equal(true);
                done();
            });
        });
    });

    describe('Exceptional cases', function () {
        it('should handle the edge case of "data" vs "rawModeData"', function () {
            var v1 = require('../../../examples/v1.0.0/simplest.json'),
                v2 = converter.convert(v1);

            expect(v2.item[0].request.body.raw).to.eql('something');
        });

        it('should replace .id with _postman_id', function () {
            var v1 = require('../../../examples/v1.0.0/simplest.json'),
                v2 = JSON.parse(JSON.stringify(converter.convert(v1)));

            expect(v2.item[0]).to.not.have.property('id');
            expect(v2.item[0]).not.to.have.property('_postman_id');
        });

        it('should retain all request and folder ids if asked to', function () {
            var v1 = require('../../../examples/v1.0.0/simplest.json'),
                v2 = JSON.parse(JSON.stringify(converter.convert(v1, {
                    retainIds: true
                })));

            expect(v2.item[0]).to.have.property('id');
        });

        it('should mark commented out headers as disabled', function () {
            var v1 = require('../../../examples/v1.0.0/disabledheaders.json'),
                v2 = JSON.parse(JSON.stringify(converter.convert(v1, {
                    retainIds: true
                })));

            expect(v2.item[0].request.header[1].disabled).to.equal(true);
        });

        it('should not set default request body for requests with no data', function () {
            var v1 = require('../../../examples/v1.0.0/emptydata.json'),
                v2 = JSON.parse(JSON.stringify(converter.convert(v1, {
                    retainIds: true
                })));

            expect(_.isEmpty(v2.item[0].request.body)).to.equal(true);
        });

        it('should not set request body for requests with dataMode set to null but rawModeData set', function () {
            var v1 = require('../../../examples/v1.0.0/emptydatamode.json'),
                v2 = JSON.parse(JSON.stringify(converter.convert(v1, {
                    retainIds: true,
                    retainEmptyValues: true
                })));

            expect(v2.item[0].request.body).to.be.null;
        });

        it('should not set request body for requests with dataMode set to null but rawModeData set,' +
            ' retainEmptyValues false', function () {
            var v1 = require('../../../examples/v1.0.0/emptydatamode.json'),
                v2 = JSON.parse(JSON.stringify(converter.convert(v1, {
                    retainIds: true
                })));

            expect(v2.item[0].request.body).to.be.undefined;
        });
    });

    describe('Binary File reference', function () {
        it('should be converted to v2 correctly', function () {
            var v1 = require('../../../examples/v1.0.0/binary-upload.json'),
                v2 = JSON.parse(JSON.stringify(converter.convert(v1, {
                    retainIds: true
                })));

            expect(_.get(v2, 'item[0].request.body.file.src')).to.equal('sample.txt');
        });
    });

    describe('Malformed V1 collections', function () {
        var malformedJson = require(path.join(examplesDir, 'malformed.json'));

        it('should remove duplicate / non existent folder/request ids', function (done) {
            var converted = JSON.parse(JSON.stringify(converter.convert(malformedJson))),
                reverted = JSON.parse(JSON.stringify(reverseConverter.convert(converted)));

            expect(reverted.order).to.have.length(1);
            expect(reverted.folders_order).to.have.length(2);

            expect(reverted.folders[1].order).to.have.length(2); // F5
            expect(reverted.folders[1].folders_order).to.have.length(4); // F5

            expect(reverted.folders[3].order).to.have.length(0); // F4
            expect(reverted.folders[4].order).to.have.length(0); // F5.F1
            done();
        });
    });

    describe('responses_order', function () {
        it('should order responses as-is if no responses_order present', function (done) {
            const collection = {
                    order: ['Request1'],
                    requests: [
                        {
                            id: 'Request1',
                            name: 'Test',
                            responses: [
                                { id: 'Response1', name: 'Response1' },
                                { id: 'Response2', name: 'Response2' },
                                { id: 'Response3', name: 'Response3' }
                            ]
                        }
                    ]
                },
                converted = converter.convert(collection);

            expect(converted).to.be.an('object');
            expect(converted.item).to.be.an('array');
            expect(converted.item[0]).to.be.an('object');
            expect(converted.item[0].response).to.be.an('array');

            expect(_.map(converted.item[0].response, 'name')).to
                .eql(_.map(collection.requests[0].responses, 'name'));

            return done();
        });

        it('should order responses as per responses_order, if present', function (done) {
            const collection = {
                    order: ['Request1'],
                    requests: [
                        {
                            id: 'Request1',
                            name: 'Test',
                            responses_order: [
                                'Response2',
                                'Response3',
                                'Response1'
                            ],
                            responses: [
                                { id: 'Response1', name: 'Response1' },
                                { id: 'Response2', name: 'Response2' },
                                { id: 'Response3', name: 'Response3' }
                            ]
                        }
                    ]
                },
                converted = converter.convert(collection);

            expect(converted).to.be.an('object');
            expect(converted.item).to.be.an('array');
            expect(converted.item[0]).to.be.an('object');
            expect(converted.item[0].response).to.be.an('array');

            expect(_.map(converted.item[0].response, 'name')).to
                .eql(collection.requests[0].responses_order);

            return done();
        });

        it('should ignore responses not specified in responses_order', function (done) {
            const collection = {
                    order: ['Request1'],
                    requests: [
                        {
                            id: 'Request1',
                            name: 'Test',
                            responses_order: [
                                'Response2',
                                'Response1'
                            ],
                            responses: [
                                { id: 'Response1', name: 'Response1' },
                                { id: 'Response2', name: 'Response2' },
                                { id: 'Response3', name: 'Response3' }
                            ]
                        }
                    ]
                },
                converted = converter.convert(collection);

            expect(converted).to.be.an('object');
            expect(converted.item).to.be.an('array');
            expect(converted.item[0]).to.be.an('object');
            expect(converted.item[0].response).to.be.an('array');

            expect(_.map(converted.item[0].response, 'name')).to
                .eql(collection.requests[0].responses_order);

            return done();
        });

        it('should ignore response ids not specified in responses', function (done) {
            const collection = {
                    order: ['Request1'],
                    requests: [
                        {
                            id: 'Request1',
                            name: 'Test',
                            responses_order: [
                                'Invalid',
                                'Response1'
                            ],
                            responses: [
                                { id: 'Response1', name: 'Response1' },
                                { id: 'Response2', name: 'Response2' },
                                { id: 'Response3', name: 'Response3' }
                            ]
                        }
                    ]
                },
                converted = converter.convert(collection);

            expect(converted).to.be.an('object');
            expect(converted.item).to.be.an('array');
            expect(converted.item[0]).to.be.an('object');
            expect(converted.item[0].response).to.be.an('array');

            expect(_.map(converted.item[0].response, 'name')).to
                .eql(['Response1']);

            return done();
        });
    });
});
