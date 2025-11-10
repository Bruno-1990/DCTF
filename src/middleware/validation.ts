import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { CustomError } from './errorHandler';

/**
 * Middleware de validação genérico para body
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      throw new CustomError(`Validation Error: ${errorMessage}`, 400);
    }

    // Substituir req.body com dados sanitizados
    req.body = value;
    next();
  };
};

/**
 * Middleware de validação para parâmetros de rota
 */
export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      throw new CustomError(`Parameter Validation Error: ${errorMessage}`, 400);
    }

    // Substituir req.params com dados sanitizados
    req.params = value;
    next();
  };
};

/**
 * Middleware de validação para query parameters
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      throw new CustomError(`Query Validation Error: ${errorMessage}`, 400);
    }

    // Substituir req.query com dados sanitizados
    req.query = value;
    next();
  };
};

/**
 * Middleware de validação para headers
 */
export const validateHeaders = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.headers, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      throw new CustomError(`Header Validation Error: ${errorMessage}`, 400);
    }

    next();
  };
};

/**
 * Middleware de validação combinada (body + params + query)
 */
export const validateAll = (schemas: {
  body?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  headers?: Joi.ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validar body
    if (schemas.body) {
      const { error } = schemas.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false
      });
      if (error) {
        errors.push(...error.details.map(detail => `Body: ${detail.message}`));
      } else {
        req.body = schemas.body.validate(req.body).value;
      }
    }

    // Validar params
    if (schemas.params) {
      const { error } = schemas.params.validate(req.params, {
        abortEarly: false,
        stripUnknown: true
      });
      if (error) {
        errors.push(...error.details.map(detail => `Params: ${detail.message}`));
      } else {
        req.params = schemas.params.validate(req.params).value;
      }
    }

    // Validar query
    if (schemas.query) {
      const { error } = schemas.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });
      if (error) {
        errors.push(...error.details.map(detail => `Query: ${detail.message}`));
      } else {
        req.query = schemas.query.validate(req.query).value;
      }
    }

    // Validar headers
    if (schemas.headers) {
      const { error } = schemas.headers.validate(req.headers, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: true
      });
      if (error) {
        errors.push(...error.details.map(detail => `Headers: ${detail.message}`));
      }
    }

    if (errors.length > 0) {
      throw new CustomError(`Validation Error: ${errors.join(', ')}`, 400);
    }

    next();
  };
};

/**
 * Middleware de sanitização de dados
 */
export const sanitizeData = (req: Request, res: Response, next: NextFunction): void => {
  // Sanitizar strings removendo caracteres perigosos
  const sanitizeString = (str: string): string => {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .trim();
  };

  // Sanitizar objeto recursivamente
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitizar body, params e query
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Schemas de validação comuns
 */
export const commonSchemas = {
  // Validação de UUID
  uuid: Joi.string().uuid().required().messages({
    'string.guid': 'Deve ser um UUID válido',
    'any.required': 'Campo obrigatório'
  }),

  // Validação de ID numérico
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'Deve ser um número',
    'number.integer': 'Deve ser um número inteiro',
    'number.positive': 'Deve ser um número positivo',
    'any.required': 'Campo obrigatório'
  }),

  // Validação de paginação
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
  }),

  // Validação de data
  date: Joi.date().iso().messages({
    'date.format': 'Deve estar no formato ISO 8601'
  }),

  // Validação de email
  email: Joi.string().email().messages({
    'string.email': 'Deve ser um email válido'
  }),

  // Validação de CNPJ
  cnpj: Joi.string().pattern(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/).messages({
    'string.pattern.base': 'CNPJ deve estar no formato 00.000.000/0000-00'
  }),

  // Validação de período (YYYY-MM)
  periodo: Joi.string().pattern(/^\d{4}-\d{2}$/).messages({
    'string.pattern.base': 'Período deve estar no formato YYYY-MM'
  })
};

