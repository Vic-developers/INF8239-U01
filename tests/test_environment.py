"""LAB00 — Tests de validación del entorno."""

from inf8239_u01.environment import environment_message


def test_environment_message_exacto() -> None:
    """El mensaje debe ser exactamente 'Entorno INF-8239 listo'."""
    assert environment_message() == "Entorno INF-8239 listo"


def test_environment_message_es_texto() -> None:
    """El mensaje debe ser una cadena no vacía."""
    msg = environment_message()
    assert isinstance(msg, str)
    assert len(msg) > 0
