// Aguarda o conteúdo da página ser totalmente carregado antes de executar o script
document.addEventListener('DOMContentLoaded', function() {

    // 1. Selecionar os elementos do formulário que vamos usar
    const leadForm = document.querySelector('.lead-form form');
    const nameInput = document.querySelector('input[name="nome"]');
    const emailInput = document.querySelector('input[name="email"]');

    // 2. Adicionar um "ouvinte" para o evento de submissão do formulário
    leadForm.addEventListener('submit', function(event) {
        
        // Limpa erros anteriores
        clearErrors();

        let hasError = false;

        // 3. Validar o campo do nome
        if (nameInput.value.trim() === '') {
            showError(nameInput, 'O campo nome é obrigatório.');
            hasError = true;
        }

        // 4. Validar o campo de e-mail
        if (emailInput.value.trim() === '') {
            showError(emailInput, 'O campo e-mail é obrigatório.');
            hasError = true;
        } else if (!isValidEmail(emailInput.value)) {
            showError(emailInput, 'Por favor, insira um e-mail válido.');
            hasError = true;
        }

        // 5. Impedir o envio do formulário se houver um erro
        if (hasError) {
            event.preventDefault(); // Cancela o comportamento padrão de envio do formulário
        }
    });

    // Função para verificar se o e-mail tem um formato válido
    function isValidEmail(email) {
        const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        return regex.test(email);
    }

    // Função para mostrar uma mensagem de erro visual
    function showError(inputElement, message) {
        // Adiciona a classe de erro ao campo
        inputElement.classList.add('error');

        // Cria e insere a mensagem de erro abaixo do campo
        const errorElement = document.createElement('p');
        errorElement.className = 'error-message';
        errorElement.innerText = message;
        inputElement.parentNode.insertBefore(errorElement, inputElement.nextSibling);
    }

    // Função para limpar todas as mensagens de erro
    function clearErrors() {
        const errorInputs = document.querySelectorAll('.error');
        errorInputs.forEach(input => input.classList.remove('error'));

        const errorMessages = document.querySelectorAll('.error-message');
        errorMessages.forEach(message => message.remove());
    }

});