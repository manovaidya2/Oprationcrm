module.exports = function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const err = new Error('Validation failed');
      err.status = 400;
      err.details = result.error.flatten();
      return next(err);
    }
    req[source] = result.data;
    next();
  };
};
