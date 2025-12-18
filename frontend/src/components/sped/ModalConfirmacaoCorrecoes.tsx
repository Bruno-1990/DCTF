import React from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { motion } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  XMarkIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatCurrency';

interface ModalConfirmacaoCorrecoesProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  estatisticas: {
    total: number;
    porPrioridade: {
      alta: number;
      media: number;
      baixa: number;
    };
    valorTotal: number;
  };
}

const ModalConfirmacaoCorrecoes: React.FC<ModalConfirmacaoCorrecoesProps> = ({
  isOpen,
  onClose,
  onConfirm,
  estatisticas
}) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop com blur */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        {/* Container do modal */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all">
                {/* Header com gradiente */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
                      >
                        <ExclamationTriangleIcon className="h-6 w-6 text-white" />
                      </motion.div>
                      <div>
                        <Dialog.Title className="text-2xl font-bold text-white">
                          Confirmar Aplicação
                        </Dialog.Title>
                        <p className="text-blue-100 text-sm mt-1">
                          {estatisticas.total} correções serão aplicadas
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-white/80 hover:text-white transition-colors rounded-lg p-1 hover:bg-white/10"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {/* Conteúdo */}
                <div className="px-6 py-6 space-y-6">
                  {/* Estatísticas principais com animação */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 gap-4"
                  >
                    {/* Total de Correções */}
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                          <ChartBarIcon className="h-5 w-5 text-white" />
                        </div>
                        <p className="text-sm font-medium text-gray-600">Total de Correções</p>
                      </div>
                      <p className="text-4xl font-bold text-blue-700">{estatisticas.total}</p>
                    </motion.div>

                    {/* Impacto Estimado */}
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                          <CurrencyDollarIcon className="h-5 w-5 text-white" />
                        </div>
                        <p className="text-sm font-medium text-gray-600">Impacto Estimado</p>
                      </div>
                      <p className="text-3xl font-bold text-purple-700">
                        {formatCurrency(estatisticas.valorTotal)}
                      </p>
                    </motion.div>
                  </motion.div>

                  {/* Distribuição por Prioridade */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-gray-50 rounded-xl p-5 border border-gray-200"
                  >
                    <p className="text-sm font-semibold text-gray-700 mb-4">Distribuição por Prioridade</p>
                    <div className="grid grid-cols-3 gap-3">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        className="bg-red-50 rounded-lg p-4 text-center border border-red-200"
                      >
                        <p className="text-xs font-medium text-gray-600 mb-1">Alta</p>
                        <p className="text-2xl font-bold text-red-600">{estatisticas.porPrioridade.alta}</p>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 }}
                        className="bg-yellow-50 rounded-lg p-4 text-center border border-yellow-200"
                      >
                        <p className="text-xs font-medium text-gray-600 mb-1">Média</p>
                        <p className="text-2xl font-bold text-yellow-600">{estatisticas.porPrioridade.media}</p>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 }}
                        className="bg-green-50 rounded-lg p-4 text-center border border-green-200"
                      >
                        <p className="text-xs font-medium text-gray-600 mb-1">Baixa</p>
                        <p className="text-2xl font-bold text-green-600">{estatisticas.porPrioridade.baixa}</p>
                      </motion.div>
                    </div>
                  </motion.div>

                  {/* Aviso */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-4"
                  >
                    <div className="flex items-start gap-3">
                      <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-amber-900 text-sm mb-1">Atenção</p>
                        <p className="text-sm text-amber-800">
                          Esta ação modificará o arquivo SPED permanentemente. 
                          Certifique-se de ter um backup antes de continuar.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Footer com botões */}
                <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onClose}
                    className="px-6 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onConfirm}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-500/50"
                  >
                    <WrenchScrewdriverIcon className="h-5 w-5" />
                    Confirmar e Aplicar
                  </motion.button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ModalConfirmacaoCorrecoes;

