import React from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export interface PipelineStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
  progress?: number;
}

interface PipelineViewProps {
  steps: PipelineStep[];
  currentStep?: string;
  overallProgress?: number;
}

const PipelineView: React.FC<PipelineViewProps> = ({
  steps,
  currentStep,
  overallProgress = 0,
}) => {
  const getStepIcon = (step: PipelineStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
      case 'running':
        return <ArrowPathIcon className="h-6 w-6 text-blue-500 animate-spin" />;
      case 'error':
        return <XCircleIcon className="h-6 w-6 text-red-500" />;
      default:
        return <ClockIcon className="h-6 w-6 text-gray-400" />;
    }
  };

  const getStepColor = (step: PipelineStep) => {
    switch (step.status) {
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'running':
        return 'bg-blue-50 border-blue-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">Pipeline de Processamento</h3>
          <span className="text-sm text-gray-600">{Math.round(overallProgress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.status === 'completed';
          const isRunning = step.status === 'running';
          const isError = step.status === 'error';

          return (
            <div
              key={step.id}
              className={`${getStepColor(step)} rounded-lg p-4 border-2 transition-all duration-200 ${
                isActive ? 'ring-2 ring-blue-500 ring-offset-2' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className="mt-0.5">{getStepIcon(step)}</div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-medium text-gray-900">{step.name}</h4>
                      {isRunning && step.progress !== undefined && (
                        <span className="text-xs text-gray-600">
                          {Math.round(step.progress)}%
                        </span>
                      )}
                    </div>
                    {step.message && (
                      <p className="text-sm text-gray-600 mt-1">{step.message}</p>
                    )}
                    {isRunning && step.progress !== undefined && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${step.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-4">
                  {index < steps.length - 1 && (
                    <div
                      className={`w-0.5 h-8 ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineView;

